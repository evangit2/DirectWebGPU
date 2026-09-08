//! Adapt compact D3D float vertex elements without altering the shader body.
use naga::{
    Binding, Expression as E, Literal, Scalar, ScalarKind, ShaderStage, Span, Statement as S, Type,
    TypeInner, VectorSize,
};
pub fn apply(source: &str, widths: &[u32]) -> Result<String, String> {
    if source.len() > 4 * 1024 * 1024 || widths.len() > 16 || widths.iter().any(|n| *n > 4) {
        return Err("invalid vertex component widths".into());
    }
    let mut module = naga::front::wgsl::parse_str(source).map_err(|e| e.emit_to_string(source))?;
    let index = module
        .entry_points
        .iter()
        .position(|e| e.stage == ShaderStage::Vertex && e.name == "main")
        .ok_or("vertex main missing")?;
    let mut entry = module.entry_points.remove(index);
    let mut inner = std::mem::take(&mut entry.function);
    let mut wrapper = naga::Function::default();
    wrapper.arguments = inner.arguments.clone();
    wrapper.result = inner.result.clone();
    let float = Scalar {
        kind: ScalarKind::Float,
        width: 4,
    };
    for arg in &mut wrapper.arguments {
        if arg.binding.is_none()
            && matches!(module.types[arg.ty].inner, TypeInner::Struct { .. })
            && widths.iter().any(|n| (1..=3).contains(n))
        {
            return Err("vertex expansion requires flat input locations".into());
        }
        if let Some(Binding::Location { location, .. }) = arg.binding {
            let count = widths.get(location as usize).copied().unwrap_or(0);
            if count == 0 || count == 4 {
                continue;
            }
            if module.types[arg.ty].inner
                != (TypeInner::Vector {
                    size: VectorSize::Quad,
                    scalar: float,
                })
            {
                return Err("vertex expansion requires vec4<f32> shader input".into());
            }
            let ty = if count == 1 {
                TypeInner::Scalar(float)
            } else {
                TypeInner::Vector {
                    size: if count == 2 {
                        VectorSize::Bi
                    } else {
                        VectorSize::Tri
                    },
                    scalar: float,
                }
            };
            arg.ty = module.types.insert(
                Type {
                    name: None,
                    inner: ty,
                },
                Span::UNDEFINED,
            );
        }
    }
    for arg in &mut inner.arguments {
        arg.binding = None
    }
    if let Some(result) = &mut inner.result {
        result.binding = None
    }
    inner.name = Some("d3d_vertex_body".into());
    let original_types: Vec<_> = inner.arguments.iter().map(|a| a.ty).collect();
    let helper = module.functions.append(inner, Span::UNDEFINED);
    let zero = wrapper
        .expressions
        .append(E::Literal(Literal::F32(0.0)), Span::UNDEFINED);
    let one = wrapper
        .expressions
        .append(E::Literal(Literal::F32(1.0)), Span::UNDEFINED);
    let args: Vec<_> = (0..wrapper.arguments.len())
        .map(|i| {
            wrapper
                .expressions
                .append(E::FunctionArgument(i as u32), Span::UNDEFINED)
        })
        .collect();
    let mut expanded = Vec::new();
    for (i, arg) in args.into_iter().enumerate() {
        if wrapper.arguments[i].ty == original_types[i] {
            expanded.push(arg);
            continue;
        }
        let count = match module.types[wrapper.arguments[i].ty].inner {
            TypeInner::Scalar(_) => 1,
            TypeInner::Vector { size, .. } => size as usize,
            _ => return Err("unsupported compact input type".into()),
        };
        let start = wrapper.expressions.len();
        let mut components = Vec::new();
        for component in 0..4 {
            components.push(if component >= count {
                if component == 3 {
                    one
                } else {
                    zero
                }
            } else if count == 1 {
                arg
            } else {
                wrapper.expressions.append(
                    E::AccessIndex {
                        base: arg,
                        index: component as u32,
                    },
                    Span::UNDEFINED,
                )
            });
        }
        let value = wrapper.expressions.append(
            E::Compose {
                ty: original_types[i],
                components,
            },
            Span::UNDEFINED,
        );
        wrapper.body.push(
            S::Emit(wrapper.expressions.range_from(start)),
            Span::UNDEFINED,
        );
        expanded.push(value);
    }
    let result = wrapper
        .expressions
        .append(E::CallResult(helper), Span::UNDEFINED);
    wrapper.body.push(
        S::Call {
            function: helper,
            arguments: expanded,
            result: Some(result),
        },
        Span::UNDEFINED,
    );
    wrapper.body.push(
        S::Return {
            value: Some(result),
        },
        Span::UNDEFINED,
    );
    entry.function = wrapper;
    module.entry_points.insert(index, entry);
    let info = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::empty(),
    )
    .validate(&module)
    .map_err(|e| format!("vertex expansion validation: {e:?}"))?;
    naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty())
        .map_err(|e| format!("vertex expansion emission: {e}"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compact_inputs_keep_original_shader_and_validate() {
        let source="@vertex fn main(@location(0) position:vec4<f32>, @location(3) color:vec4<f32>)->@builtin(position) vec4<f32>{return position+color*0.0;}";
        for n in 1..=3 {
            let output = apply(source, &[n, 0, 0, 2]).unwrap();
            let module = naga::front::wgsl::parse_str(&output).unwrap();
            naga::valid::Validator::new(
                naga::valid::ValidationFlags::all(),
                naga::valid::Capabilities::empty(),
            )
            .validate(&module)
            .unwrap();
            assert_eq!(module.functions.len(), 1);
            assert!(output.contains("d3d_vertex_body"));
        }
        assert!(apply(source, &[5]).is_err());
    }
}
