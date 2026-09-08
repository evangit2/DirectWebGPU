# Humus original-binary browser runtime

**Current milestone:** the unmodified `DynamicBranching.exe` executes through translated x86/WASM startup. The D3D9 frontend creates a COM object at `Direct3DCreate9(31)` and execution reaches `IDirect3D9::GetDeviceCaps` after reading/processing the real scene model. D3D9 rendering is not implemented; the canvas is blank and rendering acceptance fails. See `MEASURED-RESULTS.json` for the latest browser attempt and exact blocker.

This repository contains local runtime patches and a test harness, not a source port of the demo. The official archive and generated programs remain ignored. The input EXE SHA-256 is `7664f1f55d71593b6af9475bef06aba811bbe8a5ec3ba690ec559064d6207bc5`.

## Reproduce

Prerequisites: Python 3, Git, Rust/rustup from https://rustup.rs . Native diagnostic builds also need SDL3 (on this Mac: `brew install sdl3`). A macOS host was tested; other host builds have not been verified.

```sh
export PATH="$HOME/.cargo/bin:$PATH"
rustup toolchain install 1.98.1 --profile minimal --component rustfmt
rustup toolchain install nightly-2026-09-07 --profile minimal --component rust-src --target wasm32-unknown-unknown
cargo +1.98.1 install wasm-bindgen-cli --version 0.2.121 --locked
scripts/restore.sh
python3 scripts/serve.py 8765
```

Open http://127.0.0.1:8765/humus-runtime and click **Start Humus**. The server binds only to loopback. Localhost is a browser secure context; the actual browser probe checks cross-origin isolation and requests a WebGPU adapter/device. No deployment has been made. Theseus has no license declaration in the inspected revision, so its code/generated runtime is retained locally, not publicly hosted. Humus permits redistribution with its readme, retained in the original archive/package.

`restore.sh` verifies the archive/EXE, fetches the pinned translator, applies our patch only when cleanly applicable, installs pinned PE-inspection dependencies, generates Rust from x86, and builds WASM. It does not delete or reset an existing checkout. Translation inputs include the recovered original window callback in `evidence/entry-points.txt`. No generated function is replaced by hand.

## Development and checks

```sh
python3 scripts/bootstrap.py
scripts/translate.sh
scripts/run_native.sh             # expected nonzero until graphics is implemented; 60-second cap
scripts/build_wasm.sh
python3 scripts/test_server.py
cargo test --manifest-path vendor/theseus/Cargo.toml -p runtime virtual_cpu_tests
cargo test --manifest-path vendor/theseus/Cargo.toml -p winapi realloc_tests
cargo test --manifest-path vendor/theseus/Cargo.toml -p winapi d3d9::tests
```

`run_native.sh` runs the same translated original instructions in a native diagnostic environment and writes bounded `evidence/native-translated.*`. It is not browser acceptance. `scripts/native_reference.py` optionally runs the original under native Wine with a separate prefix/work directory and a 30-second cap; that reference is also not browser acceptance.

The browser verifies the EXE, asset, and WASM hashes, runs WASM in a terminable worker, and uses a transferred OffscreenCanvas for the guest window. Logs are bounded at producer and UI. Session diagnostics POST to a local same-origin receiver with random tokens, per-request/per-session limits and no command execution. Download diagnostics remains available when upload fails. The 4-hour button starts one bounded observation session, stops on runtime failure, and never overrides suspension. No 4-hour session has been run.

## Current limitations

Missing D3D9 device/capability/resource/state/shader support is a hard failure, not a dummy device. No application Present, draw submission, scene frames, FPS, or correct-frame startup measurements exist. The Apple Metal non-fallback adapter probe establishes availability only. There is no working CheerpX rendering baseline in this workspace and no performance comparison is claimed.

The runtime still has inherited incomplete APIs and f64-based x87 approximations; failed launches are not proof of correctness. Null-page accesses now fail immediately. AOT static scanning includes possible data and missed indirect targets; unknown instructions/targets trap. CPU vendor/features describe a virtual processor; RDTSC is a virtual 1 MHz counter quantized to host milliseconds, not physical CPU speed. The current guest-memory allocation is inherited at 256 MiB and has not been optimized. Linear memory includes other WASM allocations and must not be summed with guest memory as independent totals.

Continue at `patches/theseus.patch` / `vendor/theseus/win32/winapi/src/d3d9.rs`. Implement actual D3D9 semantics and a reusable bytecode-to-WebGPU backend; preserve alpha-tested stencil writes and stencil-tested additive lighting. Full compatibility evidence and the selected path are in `COMPATIBILITY.md` and `DECISION.md`.
