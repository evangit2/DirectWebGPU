#!/usr/bin/env python3
import json
from pathlib import Path
import subprocess
import tempfile

from theseus_patches import patch_series, read_source_manifest, source_hashes


ROOT = Path(__file__).resolve().parents[1]
CURRENT = ROOT / "vendor/theseus"
EXPECTED_REVISION = json.loads((ROOT / "dependencies.json").read_text())["theseus"]["revision"]
def main() -> None:
    if not (CURRENT / ".git").exists():
        raise SystemExit("vendor/theseus checkout is required")
    with tempfile.TemporaryDirectory(prefix="directwebgpu-patches-") as directory:
        restored = Path(directory) / "theseus"
        subprocess.run(["git", "clone", "--quiet", str(CURRENT), str(restored)], check=True)
        subprocess.run(["git", "-C", str(restored), "checkout", "--quiet", "--detach", EXPECTED_REVISION], check=True)
        patches = patch_series(ROOT)
        for patch in patches:
            subprocess.run(["git", "-C", str(restored), "apply", "--check", str(patch)], check=True)
            subprocess.run(["git", "-C", str(restored), "apply", str(patch)], check=True)
        actual = source_hashes(restored)
        expected = read_source_manifest(ROOT)
        current = source_hashes(CURRENT)
        differing = sorted(path for path in actual.keys() | expected.keys() if actual.get(path) != expected.get(path))
        if differing:
            raise SystemExit("restored source differs from manifest:\n" + "\n".join(differing))
        current_differing = sorted(path for path in current.keys() | expected.keys() if current.get(path) != expected.get(path))
        if current_differing:
            raise SystemExit("working source differs from manifest:\n" + "\n".join(current_differing))
        print(f"PASS: {len(patches)} patches reproduce {len(expected)} source files from {EXPECTED_REVISION}")


if __name__ == "__main__":
    main()
