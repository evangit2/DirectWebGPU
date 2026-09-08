#[cfg(target_family = "wasm")]
use wasm_bindgen::prelude::*;

mod generated;

#[cfg_attr(target_family = "wasm", wasm_bindgen)]
pub fn main() {
    winapi::run(&generated::EXEDATA);
}

#[cfg_attr(target_family = "wasm", wasm_bindgen)]
pub fn seed_registry_dword(root:u32, subkey:&str, name:&str, value:u32)->Result<(),String> {
    winapi::advapi32::seed_registry_dword(root,subkey,name,value)
}

#[cfg_attr(target_family = "wasm", wasm_bindgen)]
pub fn configure_guest_memory_metrics(enabled: bool) {
    winapi::memory_metrics::configure(enabled);
}
