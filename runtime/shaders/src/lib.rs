use wasm_bindgen::prelude::*;
mod combined_samplers;
/// Accept linked SPIR-V, reject invalid modules, and emit validated WGSL.
/// Coordinate adjustment is disabled: DX9 and WebGPU both use depth 0..1.
/// Viewport Y, pixel centers and winding remain responsibilities of the renderer.
#[wasm_bindgen]
pub fn spirv_to_wgsl(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() < 20 || bytes.len() > 4 * 1024 * 1024 || bytes.len() % 4 != 0 {
        return Err("SPIR-V byte length must be 20..4194304 and DWORD aligned".into());
    }
    let options = naga::front::spv::Options {
        adjust_coordinate_space: false,
        ..Default::default()
    };
    let split = combined_samplers::split(bytes)?;
    let module = naga::front::spv::parse_u8_slice(&split, &options)
        .map_err(|e| format!("SPIR-V parse: {e}"))?;
    let info = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::empty(),
    )
    .validate(&module)
    .map_err(|e| format!("SPIR-V validation: {e:?}"))?;
    let wgsl =
        naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty())
            .map_err(|e| format!("WGSL emission: {e}"))?;
    let check = naga::front::wgsl::parse_str(&wgsl)
        .map_err(|e| format!("WGSL parse: {}", e.emit_to_string(&wgsl)))?;
    naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::empty(),
    )
    .validate(&check)
    .map_err(|e| format!("WGSL validation: {e:?}"))?;
    Ok(wgsl)
}
mod alpha_test;
#[wasm_bindgen]
pub fn alpha_test_wgsl(source: &str, compare: u32, reference: u32) -> Result<String, String> {
    alpha_test::apply(source, compare, reference)
}
mod vertex_inputs;
#[wasm_bindgen]
pub fn vertex_inputs_wgsl(source: &str, widths: &[u32]) -> Result<String, String> {
    vertex_inputs::apply(source, widths)
}

/// Group, original texture binding, split sampler binding, SPIR-V image dimension.
#[wasm_bindgen]
pub fn sampler_bindings(bytes:&[u8])->Result<Vec<u32>,String>{
 if bytes.len()<20||bytes.len()>4*1024*1024||bytes.len()%4!=0{return Err("invalid sampler reflection SPIR-V length".into())}
 Ok(combined_samplers::split_with_bindings(bytes)?.1)
}

/// Flatten WebGPU resources as group, binding, kind, detail tuples. Kind 0 is
/// a uniform buffer (detail is its byte size), kind 1 is a sampled texture
/// (detail uses SPIR-V's 0/1/2/3 dimension numbering), and kind 2 is a sampler.
/// This reflects both vkd3d's already-separate resources and MojoShader's
/// combined samplers after the existing split pass.
#[wasm_bindgen]
pub fn shader_bindings(bytes: &[u8]) -> Result<Vec<u32>, String> {
    if bytes.len() < 20 || bytes.len() > 4 * 1024 * 1024 || bytes.len() % 4 != 0 {
        return Err("invalid resource reflection SPIR-V length".into());
    }
    let split = combined_samplers::split(bytes)?;
    let options = naga::front::spv::Options {
        adjust_coordinate_space: false,
        ..Default::default()
    };
    let module = naga::front::spv::parse_u8_slice(&split, &options)
        .map_err(|e| format!("SPIR-V reflection parse: {e}"))?;
    naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::empty(),
    )
    .validate(&module)
    .map_err(|e| format!("SPIR-V reflection validation: {e:?}"))?;
    let mut layouter = naga::proc::Layouter::default();
    layouter
        .update(module.to_ctx())
        .map_err(|e| format!("SPIR-V reflection layout: {e}"))?;
    let mut resources = Vec::new();
    for (_, global) in module.global_variables.iter() {
        let Some(binding) = &global.binding else { continue };
        let (kind, detail) = match (&global.space, &module.types[global.ty].inner) {
            (naga::AddressSpace::Uniform, _) => (0, layouter[global.ty].size),
            (naga::AddressSpace::Handle, naga::TypeInner::Image { dim, .. }) => {
                let dimension = match dim {
                    naga::ImageDimension::D1 => 0,
                    naga::ImageDimension::D2 => 1,
                    naga::ImageDimension::D3 => 2,
                    naga::ImageDimension::Cube => 3,
                };
                (1, dimension)
            }
            (naga::AddressSpace::Handle, naga::TypeInner::Sampler { .. }) => (2, 0),
            _ => continue,
        };
        resources.push([binding.group, binding.binding, kind, detail]);
        if resources.len() > 64 {
            return Err("too many reflected shader resources".into());
        }
    }
    resources.sort();
    Ok(resources.into_iter().flatten().collect())
}

#[wasm_bindgen]
pub fn vertex_position_wgsl(source:&str,width:u32,height:u32)->Result<String,String>{vertex_inputs::pixel_center(source,width,height)}
