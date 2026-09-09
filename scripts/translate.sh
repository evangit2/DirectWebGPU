#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
guest="${1:-humus}"
exe="${2:-assets/original/package/DynamicBranching/DynamicBranching.exe}"
out="${3:-vendor/theseus/out/$guest}"
cargo build --locked --manifest-path vendor/theseus/Cargo.toml -p tc
entry_args=()
guest_entry_points="evidence/${guest}-entry-points.txt"
if [[ -f "$guest_entry_points" ]]; then
  entry_args+=(--entry-points-file "$guest_entry_points")
elif [[ -f evidence/entry-points.txt && "$guest" == humus ]]; then
  entry_args+=(--entry-points-file evidence/entry-points.txt)
fi
if ((${#entry_args[@]})); then
  vendor/theseus/target/debug/tc --exe "$exe" --out "$out" --scan-memory --scan-immediates "${entry_args[@]}"
else
  vendor/theseus/target/debug/tc --exe "$exe" --out "$out" --scan-memory --scan-immediates
fi
