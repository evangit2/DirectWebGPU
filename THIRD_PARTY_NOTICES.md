# Third-party notices

This file credits third-party software and content used to build or run DirectWebGPU. It does not replace, modify, or grant any upstream license. Versions and revisions are pinned in `dependencies.json`, `vendor/theseus/Cargo.lock`, and `runtime/shaders/Cargo.lock`.

## Major runtime components

| Component | Use in DirectWebGPU | Version or revision | License and notice |
| --- | --- | --- | --- |
| [Theseus](https://github.com/evmar/theseus) | Major foundation: translates 32-bit x86 DOS/Win32 programs to Rust/WebAssembly and provides the Win32 compatibility environment extended by this project | `f8c1a2351b8b605812076d2dc34e84d20d95de4b` | The pinned checkout contains no license file or declaration. It is listed for attribution; no license is inferred. |
| [vkd3d](https://gitlab.winehq.org/wine/vkd3d) / `libvkd3d-shader` | Converts Direct3D shader bytecode for the WineD3D-compatible WebGPU path | 2.1 | LGPL-2.1-or-later; full notice and license are in `web/generated/vkd3d-LICENSE` and `web/generated/vkd3d-COPYING` |
| [Naga](https://github.com/gfx-rs/wgpu/tree/trunk/naga) | Parses and reflects SPIR-V, then emits WGSL for WebGPU | 30.0.1 | MIT OR Apache-2.0 |
| [MojoShader](https://github.com/icculus/mojoshader) | Legacy Direct3D shader translation retained for the deprecated `legacy-win32` mode | `ad5dff84830c2863c841f4b1f4e3df78c705b383` | zlib; retained in `third_party/licenses/MojoShader-LICENSE.txt` |
| [libopenmpt](https://lib.openmpt.org/libopenmpt/) | Browser tracker-module decoder used by the BASS-compatible music bridge | 0.8.9 | BSD-3-Clause plus bundled codec notices; retained under `web/third_party/libopenmpt/` |
| [wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen) | Rust/WebAssembly browser bindings | 0.2.121 | MIT OR Apache-2.0 |
| [Emscripten SDK](https://github.com/emscripten-core/emsdk) | Builds native compatibility components as WebAssembly | 4.0.7, revision `5eb0bde7585670252e8ba05e9d361627bffd08b5` | MIT; retained in `third_party/licenses/Emscripten-LICENSE.txt` |
| [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) | Pattern adapted by `web/coi-serviceworker.js` to enable cross-origin isolation on static hosting | upstream project by Guido Zuidhof and contributors | MIT; retained in `third_party/licenses/coi-serviceworker-LICENSE.txt` |

## Graphics headers and reference implementations

| Component | Use | Revision | License and notice |
| --- | --- | --- | --- |
| [SPIR-V Headers](https://github.com/KhronosGroup/SPIRV-Headers) | Build-time SPIR-V definitions | `04fd3caa1e8267e4d95c806cad901181728e1006` | Khronos permissive license; retained in `third_party/licenses/SPIRV-Headers-LICENSE.txt` |
| [Vulkan Headers](https://github.com/KhronosGroup/Vulkan-Headers) | Build-time Vulkan definitions | `ee2ec5fd83dafce291024683b50dc89219333076` | Apache-2.0 OR MIT; retained in `third_party/licenses/Vulkan-Headers-LICENSE.md` |
| [Wine / WineD3D](https://gitlab.winehq.org/wine/wine) | Behavioral and API-semantics reference for the primary D3D8/9 compatibility path | reference project; no Wine binary is shipped | LGPL-2.1-or-later |

## Resolved Rust dependencies

These are the third-party crates resolved by the translated runtime and shader bridge lockfiles. Names, versions, and SPDX expressions are recorded so generated WebAssembly can be traced back to its dependency graph.

### Translated runtime (`vendor/theseus/Cargo.lock`)

| License | Packages |
| --- | --- |
| MIT OR Apache-2.0 | `anyhow@1.0.102`, `bitflags@2.11.0`, `bitflags-derive@0.0.4`, `bitflags-derive-macros@0.0.4`, `bumpalo@3.20.2`, `cfg-if@1.0.4`, `itoa@1.0.18`, `js-sys@0.3.98`, `lazy_static@1.5.0`, `log@0.4.29`, `num-traits@0.2.19`, `once_cell@1.21.4`, `proc-macro2@1.0.106`, `quote@1.0.45`, `rustversion@1.0.22`, `serde_core@1.0.228`, `serde_derive@1.0.228`, `syn@2.0.117`, `wasm-bindgen@0.2.121`, `wasm-bindgen-macro@0.2.121`, `wasm-bindgen-macro-support@0.2.121`, `wasm-bindgen-shared@0.2.121`, `web-sys@0.3.98`, `widestring@1.2.1`, `windows-link@0.2.1`, `windows-metadata@0.58.0`, `windows-sys@0.61.2` |
| Apache-2.0 OR MIT | `autocfg@1.5.0`, `pin-project-lite@0.2.17` |
| Apache-2.0/MIT | `console_error_panic_hook@0.1.7` |
| BSD-3-Clause | `argh@0.1.19`, `argh_derive@0.1.19`, `argh_shared@0.1.19` |
| BSD-2-Clause OR Apache-2.0 OR MIT | `zerocopy@0.8.40`, `zerocopy-derive@0.8.40` |
| MIT | `iced-x86@1.21.0`, `slab@0.4.12` |
| MPL-2.0 | `colored@3.1.1` |
| Unlicense/MIT | `csv@1.4.0`, `csv-core@0.1.13` |
| Unlicense OR MIT | `memchr@2.8.0` |
| Apache-2.0 OR BSL-1.0 | `ryu@1.0.23` |
| Zlib | `sdl3-sys@0.6.5+SDL-3.4.8` |
| (MIT OR Apache-2.0) AND Unicode-3.0 | `unicode-ident@1.0.24` |
| MIT OR Apache-2.0 | `futures-core@0.3.32`, `futures-task@0.3.32`, `futures-util@0.3.32` |

### Shader bridge (`runtime/shaders/Cargo.lock`)

| License | Packages |
| --- | --- |
| MIT OR Apache-2.0 | `arrayvec@0.7.8`, `bitflags@2.13.1`, `bumpalo@3.20.3`, `cfg-if@1.0.4`, `half@2.7.1`, `hashbrown@0.15.5`, `hashbrown@0.17.1`, `log@0.4.34`, `naga@30.0.1`, `naga-types@30.0.1`, `num-traits@0.2.19`, `once_cell@1.21.4`, `petgraph@0.8.3`, `proc-macro2@1.0.107`, `quote@1.0.47`, `rustversion@1.0.23`, `syn@2.0.119`, `syn@3.0.5`, `thiserror@2.0.20`, `thiserror-impl@2.0.20`, `wasm-bindgen@0.2.121`, `wasm-bindgen-macro@0.2.121`, `wasm-bindgen-macro-support@0.2.121`, `wasm-bindgen-shared@0.2.121` |
| Apache-2.0 OR MIT | `autocfg@1.5.1`, `bit-set@0.10.0`, `bit-vec@0.9.1`, `equivalent@1.0.2`, `fixedbitset@0.5.7`, `indexmap@2.14.2` |
| Apache-2.0 | `codespan-reporting@0.13.1`, `spirv@0.4.0+sdk-1.4.341.0` |
| Apache-2.0/MIT | `rustc-hash@1.1.0` |
| BSD-2-Clause OR Apache-2.0 OR MIT | `zerocopy@0.8.56`, `zerocopy-derive@0.8.56` |
| MIT | `cfg_aliases@0.2.2`, `crunchy@0.2.4`, `libm@0.2.16` |
| Zlib | `foldhash@0.1.5`, `foldhash@0.2.0` |
| (MIT OR Apache-2.0) AND Unicode-3.0 | `unicode-ident@1.0.24` |
| MIT OR Apache-2.0 | `unicode-width@0.2.2` |

## Developer and inspection tools

- [Rust](https://www.rust-lang.org/) 1.98.1 and nightly-2026-09-07 are used to build the translated runtime. Rust is dual-licensed under MIT and Apache-2.0.
- [Capstone](https://www.capstone-engine.org/) 5.0.7 is used for disassembly and inspection. It uses the BSD license.
- [pefile](https://github.com/erocarrera/pefile) 2024.8.26 is used to inspect PE executables. It uses the MIT license.
- Python and Git are developer prerequisites rather than distributed runtime components.

## Demo content

The bundled Dynamic Branching demo is by Emil Persson (Humus). Its original `readme.txt`, including its redistribution terms, is retained at `assets/original/package/readme.txt`. The demo remains separate from DirectWebGPU and is not relicensed by this repository.

## Retained full license texts

- `web/generated/vkd3d-LICENSE`
- `web/generated/vkd3d-COPYING`
- `web/third_party/libopenmpt/license.txt`
- `web/third_party/libopenmpt/license.minimp3.txt`
- `web/third_party/libopenmpt/license.miniz.txt`
- `web/third_party/libopenmpt/license.mpt.BSD-3-Clause.txt`
- `web/third_party/libopenmpt/license.mpt.BSL-1.0.txt`
- `web/third_party/libopenmpt/license.stb_vorbis.txt`
- `third_party/licenses/MojoShader-LICENSE.txt`
- `third_party/licenses/Emscripten-LICENSE.txt`
- `third_party/licenses/SPIRV-Headers-LICENSE.txt`
- `third_party/licenses/Vulkan-Headers-LICENSE.md`
- `third_party/licenses/coi-serviceworker-LICENSE.txt`
