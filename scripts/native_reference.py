"""Optional native Wine reference; never a browser acceptance result."""
import subprocess, pathlib, os, json, time, shutil
root=pathlib.Path(__file__).resolve().parents[1]
env=dict(os.environ,WINEPREFIX=str(root/'.wine-reference'),WINEDEBUG='-all,+loaddll')
reference=root/'.native-reference/package'
shutil.copytree(root/'assets/original/package',reference,dirs_exist_ok=True)
started=time.monotonic()
with (root/'evidence/native-reference.log').open('w') as log:
 p=subprocess.Popen(['wine',str(reference/'DynamicBranching/DynamicBranching.exe')],cwd=reference/'DynamicBranching',env=env,stdout=log,stderr=log,start_new_session=True)
 try: result={'exit_code':p.wait(timeout=30)}
 except subprocess.TimeoutExpired:
  result={'status':'still running at 30 seconds; inspect native window separately'}
  subprocess.run(['wineserver','-k'],env=env,stdout=log,stderr=log)
  try: p.wait(timeout=5)
  except subprocess.TimeoutExpired: p.terminate()
result.update(kind='native Wine reference only',elapsed_seconds=time.monotonic()-started,rendering='not verified')
(root/'evidence/native-reference.json').write_text(json.dumps(result,indent=2)+'\n')
print(result)
