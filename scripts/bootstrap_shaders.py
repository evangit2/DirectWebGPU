"""Restore pinned shader dependencies without resetting local work."""
import hashlib
import json
import pathlib
import subprocess
import tarfile
import urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
vendor = root / 'vendor'
vendor.mkdir(exist_ok=True)
deps = json.loads((root / 'dependencies.json').read_text())


def restore_git(name, folder=None):
    dep = deps[name]
    path = vendor / (folder or name.replace('_', '-'))
    if not path.exists():
        subprocess.run(['git', 'clone', dep['url'], str(path)], check=True)
        subprocess.run(['git', '-C', str(path), 'checkout', '--detach', dep['revision']], check=True)
    actual = subprocess.check_output(['git', '-C', str(path), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != dep['revision']:
        raise SystemExit(f'{name}: unexpected revision; preserve checkout and restore in a fresh folder')
    if subprocess.check_output(['git', '-C', str(path), 'diff', 'HEAD'], text=True):
        raise SystemExit(f'{name}: modified upstream source; preserve it before restoring')
    return path


restore_git('mojoshader', 'mojoshader')
restore_git('emsdk', 'emsdk')
restore_git('spirv_headers', 'spirv-headers')
restore_git('vulkan_headers', 'vulkan-headers')

vkd3d = deps['vkd3d']
archive = vendor / f"vkd3d-{vkd3d['version']}.tar.xz"
source = vendor / f"vkd3d-{vkd3d['version']}"
if not archive.exists():
    temporary = archive.with_suffix('.download')
    urllib.request.urlretrieve(vkd3d['url'], temporary)
    temporary.replace(archive)
actual = hashlib.sha256(archive.read_bytes()).hexdigest()
if actual != vkd3d['sha256']:
    raise SystemExit(f'vkd3d: archive SHA-256 mismatch: {actual}')
if not source.exists():
    with tarfile.open(archive) as bundle:
        destination = vendor.resolve()
        for member in bundle.getmembers():
            if not (destination / member.name).resolve().is_relative_to(destination):
                raise SystemExit(f'vkd3d: unsafe archive member {member.name}')
        bundle.extractall(vendor)

patch = root / 'patches/vkd3d.patch'
reverse = subprocess.run(['git', 'apply', '--check', '--reverse', str(patch)], cwd=source).returncode == 0
if not reverse:
    subprocess.run(['git', 'apply', '--check', str(patch)], cwd=source, check=True)
    subprocess.run(['git', 'apply', str(patch)], cwd=source, check=True)

emsdk = vendor / 'emsdk/emsdk'
for action in ['install', 'activate']:
    subprocess.run([str(emsdk), action, deps['emsdk']['version']], check=True)
subprocess.run([
    str(pathlib.Path.home() / '.cargo/bin/rustup'), 'target', 'add', 'wasm32-unknown-unknown',
    '--toolchain', deps['rust'],
], check=True)
