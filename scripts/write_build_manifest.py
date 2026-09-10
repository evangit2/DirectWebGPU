import pathlib,hashlib,json,subprocess,datetime,argparse
parser=argparse.ArgumentParser(description='Write a reproducible DirectWebGPU guest build manifest.')
parser.add_argument('--wasm-profile',choices=['debug','release'])
parser.add_argument('--guest',default='humus')
parser.add_argument('--asset-root',type=pathlib.Path)
parser.add_argument('--executable')
parser.add_argument('--working-directory',default='/DynamicBranching')
parser.add_argument('--title')
args=parser.parse_args()
r=pathlib.Path(__file__).resolve().parents[1]
guest=args.guest
asset_root=(args.asset_root or (r/'assets/original/package')).resolve()
executable=args.executable or ('DynamicBranching/DynamicBranching.exe' if guest=='humus' else guest+'.exe')
artifact_dir=r/'web/generated' if guest=='humus' else r/'web/generated'/guest
manifest_path=artifact_dir/'runtime-build.json'
translated_root=r/'vendor/theseus/out'/guest
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
rev=subprocess.run(['git','rev-parse','--verify','HEAD'],cwd=r,capture_output=True,text=True)
h=hashlib.sha256()
paths=[]
for base in ['runtime','scripts','web','patches']:
 paths.extend(p for p in (r/base).rglob('*') if p.is_file() and 'generated' not in p.parts and '__pycache__' not in p.parts and 'target' not in p.parts)
for p in sorted(paths):h.update(str(p.relative_to(r)).encode()+b'\0'+p.read_bytes())
translated=hashlib.sha256()
for p in sorted(translated_root.rglob('*')):
 if p.is_file():translated.update(str(p.relative_to(translated_root)).encode()+b'\0'+p.read_bytes())
previous=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
exe_path=(asset_root/executable).resolve()
if not exe_path.is_relative_to(asset_root):raise SystemExit('executable must be inside --asset-root')
url_prefix='/generated' if guest=='humus' else f'/generated/{guest}'
artifacts={p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in [artifact_dir/f'{guest}.js',artifact_dir/f'{guest}_bg.wasm'] if p.exists()}
entry_points_path=r/'evidence'/f'{guest}-entry-points.txt'
if guest=='humus' and not entry_points_path.exists(): entry_points_path=r/'evidence/entry-points.txt'
translation_entry_points=[]
if entry_points_path.exists():
 for line in entry_points_path.read_text().splitlines():
  line=line.strip()
  if line and not line.startswith('#'): translation_entry_points.append(line)
registry=[]
if guest=='humus':
 registry=[[0x80000002,'SOFTWARE\\Humus',name,value] for name,value in {'WindowedLeft':0,'WindowedTop':0,'WindowedRight':1280,'WindowedBottom':720,'Fullscreen':0}.items()]
guest_manifest={'id':guest,'title':args.title or guest.title(),'executablePath':executable.replace('\\','/'),'workingDirectory':args.working_directory,'registryDwords':registry}
guest_profile=r/'guest-profiles'/f'{guest}.json'
if guest_profile.exists():
 profile=json.loads(guest_profile.read_text())
 if not isinstance(profile,dict):raise SystemExit(f'guest profile must contain an object: {guest_profile}')
 guest_manifest.update(profile)
manifest={
 'guest':guest_manifest,
 'wasmProfile':args.wasm_profile or previous.get('wasmProfile','debug'),
 'translatedTreeSha256':translated.hexdigest(),
 'cargoLockSha256':sha(r/'vendor/theseus/Cargo.lock'),
 'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'revision':rev.stdout.strip() if rev.returncode==0 else 'uncommitted',
 'workingTreeDirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=r)),
 'sourceSha256':h.hexdigest(),
 'executableSha256':sha(exe_path),
 'theseusRevision':json.loads((r/'dependencies.json').read_text())['theseus']['revision'],
 'translationEntryPoints':translation_entry_points,
 'moduleUrl':f'{url_prefix}/{guest}.js',
 'wasmUrl':f'{url_prefix}/{guest}_bg.wasm',
 'wasmArtifact':f'{guest}_bg.wasm',
 'artifacts':artifacts,
}
manifest_path.parent.mkdir(parents=True,exist_ok=True)
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
