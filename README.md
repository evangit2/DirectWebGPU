# DirectWebGPU original-binary browser runtime

**Development direction:** WineD3D-derived D3D8/9 semantics feeding a purpose-built WebGPU backend, while retaining Theseus, the lightweight Win32 environment and separate GPU worker. The first `wined3d-webgpu` milestone now compiles application shaders with `libvkd3d-shader`, reflects its resources through Naga, and renders the original Humus scene. The [exact-revision Humus report](evidence/wined3d-humus-run.json) and [captured frame](evidence/wined3d-humus-frame.jpg) record the current executable-level result. The custom MojoShader path remains available as `legacy-win32` and is deprecated. See the [feasibility report and incremental migration plan](docs/wined3d-feasibility.md) for the five-option comparison, licensing, module boundaries and original-EXE acceptance gates.

**Current milestone:** the original EXE renders the textured scene at 800×600 and 1280×720 through hardware WebGPU. Camera movement, bounded draw/upload batching, sampled lighting equivalence and three-minute stability are verified within their documented scopes. Full acceptance remains incomplete: see `evidence/acceptance-audit.json` and `MEASURED-RESULTS.json`. The detailed development notes below include historical checkpoints.

This repository contains the browser runtime, the original Humus demo package, generated WASM artifacts, and the translated program output needed to run the demo locally. It is not a source port of the demo. The input EXE SHA-256 is `7664f1f55d71593b6af9475bef06aba811bbe8a5ec3ba690ec559064d6207bc5`.

The long-term target is a reusable DirectX compatibility layer: an unmodified 32-bit Windows executable is translated to WebAssembly, its Win32 and Direct3D calls are handled by shared runtime code, and actual graphics are submitted to WebGPU. This is an early DirectX 8/9 implementation, not a Wine distribution and not a recreation of one game's scene. The bundled Humus executable is the reproducible public demo; other user-owned executables can use the same guest build and server flow while compatibility work continues.

## Reproduce

Prerequisites: Python 3, Git, Rust/rustup from https://rustup.rs . Native diagnostic builds also need SDL3 (on this Mac: `brew install sdl3`). A macOS host was tested; other host builds have not been verified.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
rustup toolchain install 1.98.1 --profile minimal --component rustfmt
rustup toolchain install nightly-2026-09-07 --profile minimal --component rust-src --target wasm32-unknown-unknown
cargo +1.98.1 install wasm-bindgen-cli --version 0.2.121 --locked
scripts/restore.sh
scripts/build_wasm.sh release
python3 scripts/serve.py 8765
```

Open `http://127.0.0.1:8765/humus-runtime?mode=wined3d-webgpu` and click **Start Humus**. Use `?mode=legacy-win32` for the preserved deprecated compiler path; an omitted mode currently keeps that legacy behavior for old links. The click also unlocks browser audio when the executable opens DirectSound or waveOut; browser autoplay policy can keep an autostart run silent until a user gesture. The server binds only to loopback. Localhost is a browser secure context; the actual browser probe checks cross-origin isolation and requests a WebGPU adapter/device. The runnable Humus package and generated browser artifacts are included in this repository. Humus permits redistribution with its readme, retained in `assets/original/package/readme.txt`.

The repository includes the translated Humus output and generated browser artifacts required to run the demo. The build-only Theseus, Emscripten, MojoShader, vkd3d, SPIR-V headers, and Vulkan headers checkouts remain excluded from the runnable release; their pinned revisions and fetch instructions are recorded in `dependencies.json` and `scripts/restore.sh`. The checked-in vkd3d notice and LGPL text accompany its WASM artifact, and the patch plus complete rebuild path permit relinking a modified library. Theseus does not declare a license in the inspected revision; review that upstream status before redistributing generated artifacts beyond the intended project context.

The checked-in generated artifacts make the normal run self-contained. `restore.sh` remains the full developer rebuild path: it fetches the pinned translator/toolchain, verifies the bundled archive/EXE, applies our patch, generates Rust from x86, and builds WASM. It does not delete or reset an existing checkout. Translation inputs include the recovered original window callback in `evidence/entry-points.txt`. No generated function is replaced by hand.

To try another permitted 32-bit DirectX executable from a local asset directory, keep its original files together and use the generic guest id throughout:

```sh
scripts/translate.sh mygame /path/to/assets/Game.exe vendor/theseus/out/mygame
scripts/build_wasm.sh release mygame /path/to/assets Game.exe / "My Game"
python3 scripts/serve.py 8766 mygame /path/to/assets
```

Then open `http://127.0.0.1:8766/mygame-runtime`. The executable and its assets remain outside this public repository unless their redistribution terms permit bundling them.

## Development and checks

```sh
python3 scripts/bootstrap.py
scripts/translate.sh
scripts/run_native.sh             # native diagnostic lacks browser GPU; 60-second cap
scripts/build_wasm.sh
python3 scripts/test_server.py
cargo test --manifest-path vendor/theseus/Cargo.toml -p runtime virtual_cpu_tests
cargo test --manifest-path vendor/theseus/Cargo.toml -p winapi realloc_tests
cargo test --manifest-path vendor/theseus/Cargo.toml -p winapi d3d9::tests
```

`run_native.sh` runs the same translated original instructions in a native diagnostic environment and writes bounded `evidence/native-translated.*`. It is not browser acceptance. `scripts/native_reference.py` optionally runs the original under native Wine with a separate prefix/work directory and a 30-second cap; that reference is also not browser acceptance.

The browser verifies the EXE, asset, and WASM hashes, runs WASM in a terminable worker, and uses a transferred OffscreenCanvas for the guest window. Logs are bounded at producer and UI. Session diagnostics POST to a local same-origin receiver with random tokens, per-request/per-session limits and no command execution. Download diagnostics remains available when upload fails. The 4-hour button starts one bounded observation session, stops on runtime failure, and never overrides suspension. No 4-hour session has been run.

## Compatibility and measurements

The original EXE drives the textured room, animated lights and camera input through D3D9 → hardware WebGPU. The original alpha/stencil lighting passes remain enabled. See [COMPATIBILITY.md](COMPATIBILITY.md) for the compact tested subset and [MEASURED-RESULTS.json](MEASURED-RESULTS.json) for revision-scoped evidence and outstanding measurements.

Normal presentation uses GPU-resident resources and GPU-to-GPU canvas presentation. The CPU worker owns translated execution; a separate GPU worker owns WebGPU. A bounded copied queue batches draws and uploads, flushing at resource/lifetime boundaries. Stop terminates both workers.

Useful local test modes (click Start Humus after opening):

- Add `mode=wined3d-webgpu` for the primary vkd3d shader compiler or `mode=legacy-win32` for the preserved deprecated implementation. Invalid modes fail instead of silently falling back.
- `/humus-runtime?benchmark=1&resolution=1280x720&assetCache=warm`: 60-second ordinary run after first Present, no screenshots.
- Add `benchmarkSeconds=180` for three minutes; accepted range is 60–600 seconds.
- Add `startupTrial=1` for a first-Present startup trial; `assetCache=cold` clears only app-owned asset/WASM CacheStorage. Compiler and OS caches remain uncontrolled.
- Add `captureFrames=1&cameraTest=1&sceneEquivalence=1` for separate visual/input/lighting evidence. This adds readbacks and diagnostic draws; do not treat it as ordinary performance.
- Add `guestMemory=1` for bounded mapped-range and compatibility-heap snapshots; `gpuTiming=1` for sampled GPU draw-pass queries.

Present submission rate is not display FPS. GPU queries measure selected draw passes, not complete GPU frames. Memory counters overlap and are not a browser-wide total. The current launcher requests 128 MiB guest backing after measuring a highest mapped end below 98 MiB; three-minute original camera/lighting validation passes, with 128 MiB less WASM backing. Earlier measured memory and timing reports retain their original revision scope.

There is no accepted native scene reference or working CheerpX rendering baseline. Full compatibility and the provisional sustained 60 FPS target are not established. Unsupported instructions, indirect targets and essential unimplemented APIs can still fail with diagnostics; x87 uses f64 approximations.

Shader diagnostics are built with `python3 scripts/bootstrap_shaders.py`, `python3 scripts/build_shaders.py`, `python3 scripts/test_shaders.py`, and `node scripts/test_wined3d_shaders.mjs`. The local `/shader-test.html` and `/pixel-center-test.html` pages exercise independent graphics cases; they do not substitute for launching the original EXE. Pinned dependencies and retained third-party notices are recorded in `dependencies.json`.
