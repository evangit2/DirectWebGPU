#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --locked --manifest-path vendor/theseus/Cargo.toml -p humus --bin humus
python3 scripts/run_translated.py
