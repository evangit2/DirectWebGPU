#!/usr/bin/env bash
# Non-destructive restoration: verify/recreate ignored inputs, then regenerate outputs.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/bootstrap.py
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/inspect_pe.py
scripts/translate.sh
scripts/build_wasm.sh

python3 scripts/bootstrap_shaders.py
python3 scripts/build_shaders.py
