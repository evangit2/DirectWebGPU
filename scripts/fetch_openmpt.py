#!/usr/bin/env python3
"""Install the pinned libopenmpt browser runtime and its license files."""

from __future__ import annotations

import hashlib
import io
import pathlib
import tarfile
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[1]
VERSION = "0.8.9"
URL = f"https://lib.openmpt.org/files/libopenmpt/dev/libopenmpt-{VERSION}+release.dev.js.tar.gz"
SHA256 = "b2c31cd9c99830997b7a337706509556fd1f5dd27da4b7db62e5a24ec95a2758"
PREFIX = f"libopenmpt-{VERSION}+release/"
OUTPUT = ROOT / "web" / "third_party" / "libopenmpt"
FILES = (
    "bin/wasm/libopenmpt.js",
    "bin/wasm/libopenmpt.wasm",
    "license.txt",
    "licenses/license.mpt.BSD-3-Clause.txt",
    "licenses/license.mpt.BSL-1.0.txt",
    "licenses/license.minimp3.txt",
    "licenses/license.miniz.txt",
    "licenses/license.stb_vorbis.txt",
)
HEAP_EXPORTS = (
    '\nObject.defineProperties(Module,{'
    'HEAPU8:{get:()=>HEAPU8},'
    'HEAP16:{get:()=>new Int16Array(wasmMemory.buffer)}});'
    'globalThis.libopenmpt=Module;\n'
)


def main() -> None:
    with urllib.request.urlopen(URL) as response:
        archive = response.read()
    actual = hashlib.sha256(archive).hexdigest()
    if actual != SHA256:
        raise SystemExit(f"libopenmpt archive hash mismatch: {actual}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as bundle:
        for relative in FILES:
            member = bundle.getmember(PREFIX + relative)
            source = bundle.extractfile(member)
            if source is None:
                raise SystemExit(f"libopenmpt archive entry is not a file: {relative}")
            destination = OUTPUT / pathlib.Path(relative).name
            data = source.read()
            if relative.endswith("libopenmpt.js"):
                data += HEAP_EXPORTS.encode()
            elif "license" in relative.lower():
                # Keep vendored notices textually identical while avoiding
                # platform-specific CRLF and excess EOF newline churn.
                data = data.replace(b"\r\n", b"\n").rstrip(b"\n") + b"\n"
            destination.write_bytes(data)
    print(f"installed libopenmpt {VERSION} in {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
