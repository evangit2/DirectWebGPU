"""Restore pinned shader translation dependencies without resetting local work."""
import pathlib,subprocess,json
r=pathlib.Path(__file__).resolve().parents[1];deps=json.loads((r/'dependencies.json').read_text())
for name in ['mojoshader','emsdk']:
 d=deps[name];p=r/'vendor'/name
 if not p.exists():
  subprocess.run(['git','clone',d['url'],str(p)],check=True)
  subprocess.run(['git','-C',str(p),'checkout','--detach',d['revision']],check=True)
 actual=subprocess.check_output(['git','-C',str(p),'rev-parse','HEAD'],text=True).strip()
 if actual!=d['revision']:raise SystemExit(f'{name}: unexpected revision; preserve checkout and restore in a fresh folder')
 if subprocess.check_output(['git','-C',str(p),'diff','HEAD'],text=True):raise SystemExit(f'{name}: modified upstream source; preserve it before restoring')
for action in ['install','activate']:subprocess.run([str(r/'vendor/emsdk/emsdk'),action,deps['emsdk']['version']],check=True)
subprocess.run([str(pathlib.Path.home()/'.cargo/bin/rustup'),'target','add','wasm32-unknown-unknown','--toolchain',deps['rust']],check=True)
