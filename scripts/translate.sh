#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --locked --manifest-path vendor/theseus/Cargo.toml -p tc
vendor/theseus/target/debug/tc --exe assets/original/package/DynamicBranching/DynamicBranching.exe --out vendor/theseus/out/humus --scan-memory --scan-immediates --entry-points-file evidence/entry-points.txt
