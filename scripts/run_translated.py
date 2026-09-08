"""Bounded, time-limited native diagnostic run of the AOT translated EXE."""
import pathlib,subprocess,os,threading,collections,time,json,sys
root=pathlib.Path(__file__).resolve().parents[1]
lines=collections.deque(maxlen=350);count=0
started=time.monotonic()
env=dict(os.environ,THESEUS_HEADLESS='1',THESEUS_TRACE='kernel32,user32,advapi32',THESEUS_MISSING_ADDRS=str(root/'evidence/missing-addresses.txt'),RUST_BACKTRACE='1')
p=subprocess.Popen([str(root/'vendor/theseus/target/debug/humus')],cwd=root/'assets/original/package/DynamicBranching',env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
def drain():
 global count
 for line in p.stdout:count+=1;lines.append(line[:2048])
t=threading.Thread(target=drain,daemon=True);t.start();timeout=False
try:code=p.wait(timeout=60)
except subprocess.TimeoutExpired:timeout=True;p.kill();code=p.wait()
t.join(timeout=2)
result={'kind':'native AOT diagnostic, not Wine or browser','executableSha256':json.loads((root/'dependencies.json').read_text())['executable']['sha256'],'exitCode':code,'timeout':timeout,'elapsedToExitSeconds':time.monotonic()-started,'droppedLogLines':max(0,count-len(lines)),'direct3DCreate9Reached':any('d3d9!Direct3DCreate9' in s for s in lines),'sceneFrames':0,'startupToScene':'not measured'}
(root/'evidence/native-translated.json').write_text(json.dumps(result,indent=2)+'\n')
(root/'evidence/native-translated.log').write_text(''.join(lines))
print(json.dumps(result,indent=2));print(''.join(lines)[-7000:]);sys.exit(1 if code else 0)
