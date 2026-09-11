"""Fetch pinned source and original permitted assets; preserve any existing checkout."""
import pathlib,json,subprocess,hashlib,urllib.request,zipfile,shutil
from theseus_patches import patch_series,read_source_manifest,source_hashes
ROOT=pathlib.Path(__file__).resolve().parents[1]
deps=json.loads((ROOT/'dependencies.json').read_text())
def run(*args,**kwargs):subprocess.run(args,check=True,**kwargs)
def verify(path,digest):
 actual=hashlib.sha256(path.read_bytes()).hexdigest()
 if actual!=digest:raise RuntimeError(f'Integrity failure for {path}: {actual}')
assets=ROOT/'assets/original';assets.mkdir(parents=True,exist_ok=True)
archive=assets/'DynamicBranching.zip'
if not archive.exists():
 with urllib.request.urlopen(deps['archive']['url']) as r: archive.write_bytes(r.read())
verify(archive,deps['archive']['sha256'])
package=assets/'package'
if not package.exists():
 with zipfile.ZipFile(archive) as z:
  for f in z.infolist():
   if not (package/f.filename).resolve().is_relative_to(package.resolve()):raise RuntimeError('unsafe ZIP path')
  z.extractall(package)
verify(package/deps['executable']['path'],deps['executable']['sha256'])
with zipfile.ZipFile(archive) as z:
 for entry in z.infolist():
  if not entry.is_dir() and (package/entry.filename).read_bytes()!=z.read(entry):
   raise RuntimeError(f'Original asset changed: {entry.filename}; preserve it before restoring')
vendor=ROOT/'vendor/theseus'
if not vendor.exists():
 run('git','clone',deps['theseus']['url'],str(vendor));run('git','-C',str(vendor),'checkout','--detach',deps['theseus']['revision'])
actual=subprocess.check_output(['git','-C',str(vendor),'rev-parse','HEAD'],text=True).strip()
if actual!=deps['theseus']['revision']:raise RuntimeError(f'Unexpected Theseus revision {actual}; preserve it and restore in a fresh folder')
expected_sources=read_source_manifest(ROOT)
if source_hashes(vendor)!=expected_sources:
 status=subprocess.check_output(['git','-C',str(vendor),'status','--porcelain','--untracked-files=all'],text=True)
 if status:raise RuntimeError('Theseus source is neither pristine nor the recorded DirectWebGPU patch result; preserve it and restore in a fresh folder')
 for patch in patch_series(ROOT):
  run('git','-C',str(vendor),'apply','--check',str(patch));run('git','-C',str(vendor),'apply',str(patch))
 if source_hashes(vendor)!=expected_sources:raise RuntimeError('Theseus patch result does not match patches/theseus-source.sha256')
for p in (ROOT/'runtime/humus').rglob('*'):
 if p.is_file():
  dest=vendor/'out/humus'/p.relative_to(ROOT/'runtime/humus');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
print('Verified original EXE and pinned translator. No original executable bytes changed.')
