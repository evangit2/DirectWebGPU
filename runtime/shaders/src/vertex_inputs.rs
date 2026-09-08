//! Adapt compact D3D float vertex elements without altering the shader body.
use naga::{
    Binding, Expression as E, Literal, Scalar, ScalarKind, ShaderStage, Span, Statement as S, Type,
    TypeInner, VectorSize,
};
pub fn apply(source: &str, widths: &[u32]) -> Result<String, String> {
    adapt(source, widths, None)
}
pub fn pixel_center(source: &str, width:u32, height:u32)->Result<String,String>{
    if width==0 || height==0 || width>4096 || height>4096 {return Err("invalid pixel-center viewport".into());}
    adapt(source, &[], Some([1.0/width as f32,-1.0/height as f32]))
}
fn adapt(source: &str, widths: &[u32], offset:Option<[f32;2]>) -> Result<String,String> {
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
    inner.name = Some(if offset.is_some(){"d3d_pixel_body"}else{"d3d_vertex_body"}.into());
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
    let result = if let Some(offset)=offset {
        let output=wrapper.result.as_ref().ok_or("vertex result missing")?;
        let output_ty=output.ty;
        let members=match &module.types[output_ty].inner {TypeInner::Struct{members,..}=>Some(members.clone()),_=>None};
        let is_position=|b:&Option<Binding>|matches!(b,Some(Binding::BuiltIn(naga::BuiltIn::Position{..})));
        let position_index=members.as_ref().map(|m|m.iter().position(|m|is_position(&m.binding)).ok_or("position output missing")).transpose()?;
        if members.is_none() && !is_position(&output.binding){return Err("position output missing".into());}
        let position_ty=position_index.map(|i|members.as_ref().unwrap()[i].ty).unwrap_or(output_ty);
        if module.types[position_ty].inner != (TypeInner::Vector{size:VectorSize::Quad,scalar:float}) {return Err("position must be vec4<f32>".into());}
        let dx=wrapper.expressions.append(E::Literal(Literal::F32(offset[0])),Span::UNDEFINED);
        let dy=wrapper.expressions.append(E::Literal(Literal::F32(offset[1])),Span::UNDEFINED);
        let start=wrapper.expressions.len();
        let position=position_index.map(|i|wrapper.expressions.append(E::AccessIndex{base:result,index:i as u32},Span::UNDEFINED)).unwrap_or(result);
        let mut components:Vec<_>=(0..4).map(|i|wrapper.expressions.append(E::AccessIndex{base:position,index:i},Span::UNDEFINED)).collect();
        for (i,scale) in [dx,dy].into_iter().enumerate(){
            let delta=wrapper.expressions.append(E::Binary{op:naga::BinaryOperator::Multiply,left:components[3],right:scale},Span::UNDEFINED);
            components[i]=wrapper.expressions.append(E::Binary{op:naga::BinaryOperator::Add,left:components[i],right:delta},Span::UNDEFINED);
        }
        let corrected=wrapper.expressions.append(E::Compose{ty:position_ty,components},Span::UNDEFINED);
        let value=if let Some(members)=members {
            let components=(0..members.len()).map(|i|if Some(i)==position_index{corrected}else{wrapper.expressions.append(E::AccessIndex{base:result,index:i as u32},Span::UNDEFINED)}).collect();
            wrapper.expressions.append(E::Compose{ty:output_ty,components},Span::UNDEFINED)
        }else{corrected};
        wrapper.body.push(S::Emit(wrapper.expressions.range_from(start)),Span::UNDEFINED);value
    }else{result};
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
    fn pixel_center_outputs_validate(){
        for source in ["@vertex fn main(@location(0) p:vec4<f32>)->@builtin(position) vec4<f32>{return p;}","struct O{@builtin(position) p:vec4<f32>,@location(0) c:vec4<f32>}; @vertex fn main(@location(0) p:vec4<f32>)->O{return O(p,vec4<f32>(1));}"]{let output=pixel_center(source,4,8).unwrap();assert!(output.contains("d3d_pixel_body"));assert!(output.contains("0.25"));assert!(output.contains("0.125"));}
        assert!(pixel_center("",0,4).is_err());
    }
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
