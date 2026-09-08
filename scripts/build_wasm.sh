#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
mkdir -p web/generated
cd vendor/theseus
export RUSTFLAGS='-Ctarget-feature=+atomics -Clink-arg=--shared-memory -Clink-arg=--max-memory=536870912 -Clink-arg=--import-memory -Clink-arg=--export=__heap_base -Clink-arg=--export=__wasm_init_tls -Clink-arg=--export=__tls_size -Clink-arg=--export=__tls_align -Clink-arg=--export=__tls_base'
cargo +nightly-2026-09-07 build --locked --lib -Z build-std=std,panic_abort --target wasm32-unknown-unknown -p humus
wasm-bindgen --out-dir ../../web/generated --target web --reference-types target/wasm32-unknown-unknown/debug/humus.wasm
cd ../..
python3 scripts/write_build_manifest.py
