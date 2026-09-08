//! D3D9 alpha test applied to the actual shader's color output in Naga IR.
use naga::{
    Arena, BinaryOperator as B, Block, Expression as E, Handle, Literal, Span, Statement as S,
};
fn patch(block: &mut Block, arena: &mut Arena<E>, field: Option<u32>, op: u32, reference: f32) {
    let old = std::mem::take(block);
    for (mut statement, span) in old.span_into_iter() {
        match &mut statement {
            S::Block(b) => patch(b, arena, field, op, reference),
            S::If { accept, reject, .. } => {
                patch(accept, arena, field, op, reference);
                patch(reject, arena, field, op, reference);
            }
            S::Switch { cases, .. } => {
                for case in cases {
                    patch(&mut case.body, arena, field, op, reference)
                }
            }
            S::Loop {
                body, continuing, ..
            } => {
                patch(body, arena, field, op, reference);
                patch(continuing, arena, field, op, reference);
            }
            S::Return { value: Some(value) } => {
                if op == 1 {
                    block.push(S::Kill, span);
                    continue;
                }
                let ref_expr = arena.append(E::Literal(Literal::F32(reference)), Span::UNDEFINED);
                let start: Handle<E>;
                let color = if let Some(index) = field {
                    let h = arena.append(
                        E::AccessIndex {
                            base: *value,
                            index,
                        },
                        span,
                    );
                    start = h;
                    h
                } else {
                    start = arena.append(
                        E::AccessIndex {
                            base: *value,
                            index: 3,
                        },
                        span,
                    );
                    *value
                };
                let alpha = if field.is_some() {
                    arena.append(
                        E::AccessIndex {
                            base: color,
                            index: 3,
                        },
                        span,
                    )
                } else {
                    start
                };
                let comparison = arena.append(
                    E::Binary {
                        op: match op {
                            2 => B::Less,
                            3 => B::Equal,
                            4 => B::LessEqual,
                            5 => B::Greater,
                            6 => B::NotEqual,
                            7 => B::GreaterEqual,
                            _ => unreachable!(),
                        },
                        left: alpha,
                        right: ref_expr,
                    },
                    span,
                );
                let reject = arena.append(
                    E::Unary {
                        op: naga::UnaryOperator::LogicalNot,
                        expr: comparison,
                    },
                    span,
                );
                block.push(S::Emit(naga::Range::new_from_bounds(start, reject)), span);
                block.push(
                    S::If {
                        condition: reject,
                        accept: Block::from_vec(vec![S::Kill]),
                        reject: Block::new(),
                    },
                    span,
                );
            }
            _ => {}
        }
        block.push(statement, span);
    }
}
pub fn apply(source: &str, op: u32, reference: u32) -> Result<String, String> {
    if !(1..=8).contains(&op) || reference > 255 {
        return Err("invalid D3DCMPFUNC or alpha reference".into());
    }
    if source.len() > 4 * 1024 * 1024 {
        return Err("WGSL source exceeds shader limit".into());
    }
    let mut module = naga::front::wgsl::parse_str(source).map_err(|e| e.emit_to_string(source))?;
    let mut count = 0;
    for entry in &mut module.entry_points {
        if entry.stage != naga::ShaderStage::Fragment {
            continue;
        }
        if entry.early_depth_test.is_some() {
            return Err("alpha test conflicts with forced early depth tests".into());
        }
        count += 1;
        if op == 8 {
            continue;
        }
        let result = entry
            .function
            .result
            .as_ref()
            .ok_or("alpha test requires color output")?;
        let mut ty = result.ty;
        let field = if matches!(
            result.binding,
            Some(naga::Binding::Location { location: 0, .. })
        ) {
            None
        } else {
            let naga::TypeInner::Struct { members, .. } = &module.types[ty].inner else {
                return Err("alpha test requires location 0 output".into());
            };
            let (index, member) = members
                .iter()
                .enumerate()
                .find(|(_, m)| {
                    matches!(m.binding, Some(naga::Binding::Location { location: 0, .. }))
                })
                .ok_or("alpha test requires location 0 output")?;
            ty = member.ty;
            Some(index as u32)
        };
        if !matches!(
            module.types[ty].inner,
            naga::TypeInner::Vector {
                size: naga::VectorSize::Quad,
                scalar: naga::Scalar {
                    kind: naga::ScalarKind::Float,
                    width: 4
                }
            }
        ) {
            return Err("alpha test requires float4 color output".into());
        }
        patch(
            &mut entry.function.body,
            &mut entry.function.expressions,
            field,
            op,
            reference as f32 / 255.0,
        );
    }
    if count != 1 {
        return Err("alpha test requires exactly one fragment entry point".into());
    }
    let info = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::empty(),
    )
    .validate(&module)
    .map_err(|e| format!("alpha test IR: {e:?}"))?;
    naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty())
        .map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_compares_and_nested_returns() {
        let source = "@fragment fn main(@location(0) c:vec4<f32>)->@location(0) vec4<f32>{if c.r<0.5{return c;}return vec4<f32>(1.0);}";
        for op in 1..=8 {
            let output = apply(source, op, 255).unwrap();
            assert_eq!(output.contains("discard"), op != 8);
            naga::front::wgsl::parse_str(&output).unwrap();
        }
        assert!(apply(source, 0, 255).is_err());
        assert!(apply(source, 2, 256).is_err());
    }
    #[test]
    fn preserves_other_outputs() {
        let source = "struct Out{@location(0) color:vec4<f32>,@builtin(frag_depth) depth:f32} @fragment fn main()->Out{return Out(vec4<f32>(0.5),0.25);}";
        let output = apply(source, 2, 255).unwrap();
        assert!(output.contains("frag_depth"));
        assert!(output.contains("discard"));
    }
}
