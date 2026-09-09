"""Generate web/build-manifest.json for static (GitHub Pages) deployment.

Mirrors the /api/build response shape produced by scripts/serve.py so web/app.js
works unchanged: revision, dependencies, files (path/bytes/sha256 relative to
assets/original/package), wasm_available, runtimeBuild.
"""
import pathlib, hashlib, json, os

r = pathlib.Path(__file__).resolve().parents[1]
deps = json.loads((r / 'dependencies.json').read_text())

revision = os.environ.get('GITHUB_SHA') or 'uncommitted'
try:
    import subprocess
    revision = subprocess.run(['git', 'rev-parse', '--verify', 'HEAD'], cwd=r,
                              capture_output=True, text=True).stdout.strip() or revision
except Exception:
    pass

files = [{'path': str(p.relative_to(r / 'assets/original/package')),
          'bytes': p.stat().st_size,
          'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
         for p in sorted((r / 'assets/original/package').rglob('*')) if p.is_file()]

runtime_build_path = r / 'web/generated/runtime-build.json'
manifest = {
    'revision': revision,
    'dirty': False,
    'dependencies': deps,
    'files': files,
    'wasm_available': runtime_build_path.exists(),
    'runtimeBuild': json.loads(runtime_build_path.read_text()) if runtime_build_path.exists() else None,
}

out = r / 'web/build-manifest.json'
out.write_text(json.dumps(manifest, indent=2) + '\n')
print('manifest written:', len(files), 'files ->', out)