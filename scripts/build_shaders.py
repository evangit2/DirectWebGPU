"""Build unmodified MojoShader as a bounded local WASM shader translation module."""
import pathlib,subprocess,os
r=pathlib.Path(__file__).resolve().parents[1];src=r/'vendor/mojoshader';out=r/'web/generated';out.mkdir(exist_ok=True)
flags=['-O2','-DMOJOSHADER_NO_VERSION_INCLUDE','-I'+str(src)]
for profile in ['D3D','HLSL','GLSL','GLSL120','GLSLES','GLSLES3','ARB1','ARB1_NV','METAL','GLSPIRV']:flags+=['-DSUPPORT_PROFILE_'+profile+'=0']
files=[r/'runtime/shaders/bridge.c',src/'mojoshader.c',src/'mojoshader_common.c',*sorted((src/'profiles').glob('*.c'))]
subprocess.run(['clang',*flags,'-DSHADER_NATIVE_TEST',*map(str,files),'-o',str(out/'shader-pair')],check=True)
subprocess.run([str(r/'vendor/emsdk/upstream/emscripten/emcc'),*flags,*map(str,files),'-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sMAXIMUM_MEMORY=67108864','-sINITIAL_MEMORY=16777216','-sSTACK_SIZE=1048576','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_shader_pair","_shader_reset","_shader_error","_shader_output","_shader_length","_shader_uniform_count","_shader_uniform_value","_shader_constant_count","_shader_constant_value","_shader_input_count","_shader_input_value","_shader_validate"]','-sEXPORTED_RUNTIME_METHODS=["UTF8ToString","HEAPU8"]','-o',str(out/'mojoshader.js')],check=True)
env=dict(os.environ,PATH=str(pathlib.Path.home()/'.cargo/bin')+':'+os.environ['PATH'])
subprocess.run(['cargo','build','--locked','--manifest-path',str(r/'runtime/shaders/Cargo.toml')],check=True,env=env)
subprocess.run(['cargo','build','--locked','--release','--target','wasm32-unknown-unknown','--manifest-path',str(r/'runtime/shaders/Cargo.toml'),'--lib'],check=True,env=env)
subprocess.run(['wasm-bindgen','--out-dir',str(out),'--out-name','shader_translation','--target','web',str(r/'runtime/shaders/target/wasm32-unknown-unknown/release/humus_shader_translation.wasm')],check=True,env=env)

# Test bytecode stays outside the original asset mount.
import json,struct
f=json.loads((r/'tests/shaders/fixtures.json').read_text())
for name in ['vertex','pixel','texture','vertexConstant','vertexExplicit','vertexExplicitSparse']:(out/(name+'.bin')).write_bytes(struct.pack('<'+'I'*len(f[name]),*f[name]))

import hashlib,datetime
artifacts=['mojoshader.js','mojoshader.wasm','shader_translation.js','shader_translation_bg.wasm','vertex.bin','pixel.bin','texture.bin','vertexConstant.bin','vertexExplicit.bin','vertexExplicitSparse.bin']
manifest={'revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip(),'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'dependencies':json.loads((r/'dependencies.json').read_text()),'artifacts':{name:{'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest(),'bytes':(out/name).stat().st_size} for name in artifacts}}
(out/'shader-build.json').write_text(json.dumps(manifest,indent=2)+'\n')
