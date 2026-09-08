"""Native translation diagnostics, distinct from executable rendering acceptance."""
import pathlib,subprocess,json,struct,hashlib
r=pathlib.Path(__file__).resolve().parents[1];o=r/'web/generated';fixture=json.loads((r/'tests/shaders/fixtures.json').read_text());checks=[]
for name in ['vertex','pixel','texture']:(o/(name+'.bin')).write_bytes(struct.pack('<'+'I'*len(fixture[name]),*fixture[name]))
for name in ['pixel','texture']:
 prefix=o/('test-'+name)
 subprocess.run([str(o/'shader-pair'),str(o/'vertex.bin'),str(o/(name+'.bin')),str(prefix)],check=True)
 for stage in ['vert','frag']:
  subprocess.run([str(r/'runtime/shaders/target/debug/humus-shader-translation'),str(prefix)+'.'+stage+'.spv',str(prefix)+'.'+stage+'.wgsl'],check=True)
 checks.append(name+' pair: validated SPIR-V to validated WGSL')
(o/'bad-shader.bin').write_bytes(b'bad')
p=subprocess.run([str(o/'shader-pair'),str(o/'bad-shader.bin'),str(o/'pixel.bin'),str(o/'bad')],capture_output=True,text=True)
assert p.returncode==1 and 'invalid bytecode length' in p.stderr
checks.append('native malformed bytecode rejected')
result={'kind':'shader diagnostic, not Humus acceptance','checks':checks,'fixtureSha256':hashlib.sha256((r/'tests/shaders/fixtures.json').read_bytes()).hexdigest()}
(r/'evidence/shader-native-tests.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
