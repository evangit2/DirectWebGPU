#[cfg(target_family = "wasm")]
use wasm_bindgen::prelude::*;

mod generated;

#[cfg_attr(target_family = "wasm", wasm_bindgen)]
pub fn main() {
    // Measured highest mapping is below 98 MiB; retain 30 MiB of headroom.
    let mut ctx = winapi::load_with_capacity(&generated::EXEDATA, 128 << 20);
    winapi::start(&mut ctx, &generated::EXEDATA);
}

#[cfg_attr(target_family = "wasm", wasm_bindgen)]
pub fn seed_registry_dword(root:u32, subkey:&str, name:&str, value:u32)->Result<(),String> {
    winapi::advapi32::seed_registry_dword(root,subkey,name,value)
}

#[cfg_attr(target_family = "wasm", wasm_bindgen)]
pub fn seed_registry_value(root:u32, subkey:&str, name:&str, kind:u32, value:&[u8])->Result<(),String> {
    winapi::advapi32::seed_registry_value(root,subkey,name,kind,value)
}

#[cfg_attr(target_family = "wasm", wasm_bindgen)]
pub fn configure_guest_memory_metrics(enabled: bool) {
    winapi::memory_metrics::configure(enabled);
}
