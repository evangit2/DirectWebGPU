#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
profile="${1:-debug}"
guest="${2:-humus}"
asset_root="${3:-${DIRECTWEBGPU_ASSET_ROOT:-}}"
executable="${4:-${DIRECTWEBGPU_EXECUTABLE:-}}"
working_directory="${5:-${DIRECTWEBGPU_WORKING_DIRECTORY:-/}}"
title="${6:-${DIRECTWEBGPU_TITLE:-}}"
case "$profile" in
 debug) cargo_profile=dev ;;
 release) cargo_profile=release ;;
 *) echo "Usage: scripts/build_wasm.sh [debug|release] [guest] [asset-root] [executable] [working-directory] [title]" >&2; exit 2 ;;
esac
if [[ ! "$guest" =~ ^[a-z][a-z0-9_-]*$ ]]; then echo "invalid guest id: $guest" >&2; exit 2; fi
artifact_dir="../../web/generated/$guest"
if [[ "$guest" == humus ]]; then artifact_dir="../../web/generated"; fi
mkdir -p "$artifact_dir"
cd vendor/theseus
export RUSTFLAGS='-Ctarget-feature=+atomics,+simd128 -Clink-arg=--shared-memory -Clink-arg=--max-memory=536870912 -Clink-arg=--import-memory -Clink-arg=--export=__heap_base -Clink-arg=--export=__wasm_init_tls -Clink-arg=--export=__tls_size -Clink-arg=--export=__tls_align -Clink-arg=--export=__tls_base'
cargo +nightly-2026-09-07 build --profile "$cargo_profile" --locked --lib -Z build-std=std,panic_abort --target wasm32-unknown-unknown -p "$guest"
wasm-bindgen --out-dir "$artifact_dir" --target web --reference-types "target/wasm32-unknown-unknown/$profile/$guest.wasm"
cd ../..
manifest_args=(--wasm-profile "$profile" --guest "$guest")
if [[ -n "$asset_root" ]]; then
  manifest_args+=(--asset-root "$asset_root" --executable "${executable:-$guest.exe}" --working-directory "$working_directory")
  if [[ -n "$title" ]]; then manifest_args+=(--title "$title"); fi
fi
python3 scripts/write_build_manifest.py "${manifest_args[@]}"
