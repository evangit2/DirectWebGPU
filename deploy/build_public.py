#!/usr/bin/env python3
"""Assemble the static deployment directory for the live demo.

Produces deploy/public containing:
  - web/ runtime files (index.html, JS modules, generated WASM)
  - the original Humus package under assets/
  - build-manifest.json (the /api/build response, as a static file)
  - _headers with the cross-origin isolation headers the runtime needs
"""
import hashlib
import json
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEPLOY = ROOT / "deploy"
PUBLIC = DEPLOY / "public"
WEB = ROOT / "web"
PACKAGE = ROOT / "assets/original/package"


def main() -> None:
    if PUBLIC.exists():
        shutil.rmtree(PUBLIC)
    PUBLIC.mkdir(parents=True)

    # web/ runtime at the root; module-internal paths stay relative.
    shutil.copytree(WEB, PUBLIC, dirs_exist_ok=True)
    # Drop pages that are not part of the demo deployment.
    for extra in ("shader-test.html", "pixel-center-test.html"):
        (PUBLIC / extra).unlink(missing_ok=True)

    # Original Humus package under assets/.
    assets_dir = PUBLIC / "assets"
    shutil.copytree(PACKAGE, assets_dir / "package", dirs_exist_ok=False)
    # The runtime requests assets/<path> where <path> is relative to the package
    # root (e.g. assets/DynamicBranching/...), not assets/package/...
    for entry in (assets_dir / "package").iterdir():
        target = assets_dir / entry.name
        if target.exists():
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
        shutil.move(str(entry), target)
    (assets_dir / "package").rmdir()

    # Build manifest: same shape the loopback server returned from /api/build.
    deps = json.loads((ROOT / "dependencies.json").read_text())
    revision = subprocess.run(
        ["git", "rev-parse", "--verify", "HEAD"],
        cwd=ROOT, capture_output=True, text=True,
    ).stdout.strip() or "uncommitted"
    files = [
        {
            "path": str(p.relative_to(assets_dir)),
            "bytes": p.stat().st_size,
            "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
        }
        for p in sorted(assets_dir.rglob("*")) if p.is_file()
    ]
    manifest = {
        "revision": revision,
        "dirty": bool(subprocess.run(
            ["git", "status", "--porcelain"], cwd=ROOT,
            capture_output=True, text=True,
        ).stdout),
        "dependencies": deps,
        "files": files,
        "wasm_available": (WEB / "generated/runtime-build.json").exists(),
        "runtimeBuild": json.loads((WEB / "generated/runtime-build.json").read_text()),
    }
    (PUBLIC / "build-manifest.json").write_text(json.dumps(manifest, indent=1))

    # Cross-origin isolation headers on every response (SharedArrayBuffer).
    (PUBLIC / "_headers").write_text(
        "/*\n"
        "  Cross-Origin-Opener-Policy: same-origin\n"
        "  Cross-Origin-Embedder-Policy: require-corp\n"
        "  Cross-Origin-Resource-Policy: same-origin\n"
    )
    (PUBLIC / "_redirects").write_text(
        "/humus-runtime /index.html 302\n"
        "/humus-runtime/ /index.html 302\n"
    )

    total = sum(f.stat().st_size for f in PUBLIC.rglob("*") if f.is_file())
    count = sum(1 for f in PUBLIC.rglob("*") if f.is_file())
    print(f"public/: {count} files, {total/1024/1024:.1f} MiB")


if __name__ == "__main__":
    main()