import pathlib,hashlib,json,subprocess,datetime,argparse
parser=argparse.ArgumentParser();parser.add_argument("--wasm-profile",choices=["debug","release"]);args=parser.parse_args()
r=pathlib.Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
g=r/'web/generated'
rev=subprocess.run(['git','rev-parse','--verify','HEAD'],cwd=r,capture_output=True,text=True)
h=hashlib.sha256()
paths=[]
for base in ['runtime','scripts','web','patches']:
 paths.extend(p for p in (r/base).rglob('*') if p.is_file() and 'generated' not in p.parts and '__pycache__' not in p.parts and 'target' not in p.parts)
for p in sorted(paths):h.update(str(p.relative_to(r)).encode()+b'\0'+p.read_bytes())
translated=hashlib.sha256()
for p in sorted((r/'vendor/theseus/out/humus').rglob('*')):
 if p.is_file():translated.update(str(p.relative_to(r/'vendor/theseus/out/humus')).encode()+b'\0'+p.read_bytes())
previous=json.loads((g/'runtime-build.json').read_text()) if (g/'runtime-build.json').exists() else {}
manifest={'wasmProfile':args.wasm_profile or previous.get('wasmProfile','debug'),'translatedTreeSha256':translated.hexdigest(),'cargoLockSha256':sha(r/'vendor/theseus/Cargo.lock'),'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'revision':rev.stdout.strip() if rev.returncode==0 else 'uncommitted','workingTreeDirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=r)),'sourceSha256':h.hexdigest(),'executableSha256':json.loads((r/'dependencies.json').read_text())['executable']['sha256'],'theseusRevision':json.loads((r/'dependencies.json').read_text())['theseus']['revision'],'translationEntryPoints':(r/'evidence/entry-points.txt').read_text().splitlines(),'artifacts':{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in [g/'humus.js',g/'humus_bg.wasm']}}
(g/'runtime-build.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
