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
for name,expected in [('vertexExplicit',[0,1]),('vertexExplicitSparse',[0,9])]:
 (o/(name+'.bin')).write_bytes(struct.pack('<'+'I'*len(fixture[name]),*fixture[name]))
 prefix=o/('test-'+name)
 subprocess.run([str(o/'shader-pair'),str(o/(name+'.bin')),str(o/'pixel.bin'),str(prefix)],check=True)
 subprocess.run([str(r/'runtime/shaders/target/debug/humus-shader-translation'),str(prefix)+'.vert.spv',str(prefix)+'.vert.wgsl'],check=True)
 import re
 wgsl=pathlib.Path(str(prefix)+'.vert.wgsl').read_text()
 signature=wgsl.split('fn main(')[1].split(' -> ')[0]
 locations=[int(x) for x in re.findall(r'@location\((\d+)\)',signature)]
 assert locations==expected,(name,locations,expected)
 checks.append(name+': exact input locations '+str(locations)+'; no invented legacy semantic registers')
(o/'bad-shader.bin').write_bytes(b'bad')
p=subprocess.run([str(o/'shader-pair'),str(o/'bad-shader.bin'),str(o/'pixel.bin'),str(o/'bad')],capture_output=True,text=True)
assert p.returncode==1 and 'invalid bytecode length' in p.stderr
checks.append('native malformed bytecode rejected')
result={'kind':'shader diagnostic, not Humus acceptance','checks':checks,'fixtureSha256':hashlib.sha256((r/'tests/shaders/fixtures.json').read_bytes()).hexdigest()}
(r/'evidence/shader-native-tests.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
