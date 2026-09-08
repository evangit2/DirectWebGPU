"""Retain the latest completed original startup trial in a named series."""
import argparse,json,pathlib,base64,time
p=argparse.ArgumentParser();p.add_argument('--directory',type=pathlib.Path,required=True);p.add_argument('--mode',choices=['cold','warm'],required=True);p.add_argument('--capture',action='store_true');p.add_argument('--wait-seconds',type=float,default=0);a=p.parse_args()
assert 0<=a.wait_seconds<=120
deadline=time.monotonic()+a.wait_seconds
while True:
 source=max(pathlib.Path('evidence/sessions').glob('*/*.json'),key=lambda p:p.stat().st_mtime);r=json.loads(source.read_text())['report']
 if not (a.directory/(r['runId']+'.json')).exists(): break
 if time.monotonic()>=deadline: raise TimeoutError('no new terminal trial report')
 time.sleep(0.2)
assert r['status']=='startup trial completed after first Present'
assert r['assetCacheMetrics']['mode']==a.mode
assert bool(r.get('frameCaptures'))==a.capture
assert r['originalExecutionAttempted'] and r['applicationPresents']>0
assert [r['window']['width'],r['window']['height']]==[1280,720]
a.directory.mkdir(parents=True,exist_ok=True);out=a.directory/(r['runId']+'.json');assert not out.exists(),'duplicate trial';out.write_text(json.dumps(r,indent=2)+'\n')
if a.capture:
 f=r['frameCaptures'][0];assert f['present']==1;(a.directory/(r['runId']+'.jpg')).write_bytes(base64.b64decode(f['jpegBase64']))
print(r['runId'],a.mode,'capture' if a.capture else 'timing',r['presentationMetrics']['firstPresentMs'])
