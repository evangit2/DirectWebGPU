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
