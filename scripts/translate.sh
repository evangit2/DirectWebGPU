#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
guest="${1:-humus}"
exe="${2:-assets/original/package/DynamicBranching/DynamicBranching.exe}"
out="${3:-vendor/theseus/out/$guest}"

# The translator writes the guest's generated.rs, but the generated crate also
# needs the small shared WASM/native entrypoint that owns the runtime context.
# Keep that wrapper generic so a new executable can use the same pipeline
# without copying a game-specific crate by hand.  Existing guest crates are
# preserved for experiments that need a custom entrypoint.
if [[ "$guest" != humus && ! -f "$out/Cargo.toml" ]]; then
  mkdir -p "$out/src"
  cp runtime/humus/Cargo.toml "$out/Cargo.toml"
  cp runtime/humus/src/lib.rs runtime/humus/src/main.rs "$out/src/"
  python3 - "$out/Cargo.toml" "$guest" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
guest = sys.argv[2]
text = path.read_text()
text = text.replace('name = "humus"', f'name = "{guest}"', 1)
path.write_text(text)
PY
fi

# Theseus uses one workspace for generated guests.  Register a new guest in
# that local checkout so Cargo can resolve the shared workspace dependencies.
if [[ "$guest" != humus ]]; then
  python3 - "$guest" <<'PY'
import pathlib, sys
guest = sys.argv[1]
path = pathlib.Path('vendor/theseus/Cargo.toml')
text = path.read_text()
member = f'  "out/{guest}",'
if member not in text:
    lines = text.splitlines(keepends=True)
    for index, line in enumerate(lines):
        if line.strip() == 'members = [':
            lines.insert(index + 1, member + '\n')
            path.write_text(''.join(lines))
            break
    else:
        raise SystemExit('Theseus workspace members list not found')
PY
fi

# Adding a guest crate changes the workspace lockfile.  Resolve that new
# workspace member while keeping the pinned dependency versions already in the
# lockfile; the WASM build below remains locked and reproducible.
cargo build --manifest-path vendor/theseus/Cargo.toml -p tc
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
