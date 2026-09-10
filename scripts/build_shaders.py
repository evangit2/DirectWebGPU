"""Build both retained MojoShader and primary vkd3d-shader WebGPU paths."""
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import struct
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
vendor = root / 'vendor'
mojo = vendor / 'mojoshader'
out = root / 'web/generated'
out.mkdir(exist_ok=True)
deps = json.loads((root / 'dependencies.json').read_text())
emcc = vendor / 'emsdk/upstream/emscripten/emcc'


def normalize_generated_javascript(path):
    """Keep deterministic Emscripten output free of whitespace-only lines."""
    lines = path.read_text().splitlines()
    path.write_text('\n'.join(line.rstrip() for line in lines) + '\n')

mojo_flags = ['-O2', '-DMOJOSHADER_NO_VERSION_INCLUDE', '-I' + str(mojo)]
for profile in ['D3D', 'HLSL', 'GLSL', 'GLSL120', 'GLSLES', 'GLSLES3', 'ARB1', 'ARB1_NV', 'METAL', 'GLSPIRV']:
    mojo_flags += ['-DSUPPORT_PROFILE_' + profile + '=0']
mojo_files = [root / 'runtime/shaders/bridge.c', mojo / 'mojoshader.c', mojo / 'mojoshader_common.c', *sorted((mojo / 'profiles').glob('*.c'))]
subprocess.run(['clang', *mojo_flags, '-DSHADER_NATIVE_TEST', *map(str, mojo_files), '-o', str(out / 'shader-pair')], check=True)
subprocess.run([
    str(emcc), *mojo_flags, *map(str, mojo_files), '-sMODULARIZE=1', '-sEXPORT_ES6=1',
    '-sENVIRONMENT=web,worker,node', '-sALLOW_MEMORY_GROWTH=1', '-sMAXIMUM_MEMORY=67108864',
    '-sINITIAL_MEMORY=16777216', '-sSTACK_SIZE=1048576', '-sFILESYSTEM=0',
    '-sEXPORTED_FUNCTIONS=["_malloc","_free","_shader_pair","_shader_reset","_shader_error","_shader_output","_shader_length","_shader_uniform_count","_shader_uniform_value","_shader_constant_count","_shader_constant_value","_shader_input_count","_shader_input_value","_shader_validate"]',
    '-sEXPORTED_RUNTIME_METHODS=["UTF8ToString","HEAPU8"]', '-o', str(out / 'mojoshader.js'),
], check=True)
normalize_generated_javascript(out / 'mojoshader.js')

vkd3d_source = vendor / f"vkd3d-{deps['vkd3d']['version']}"
vkd3d_build = vendor / 'vkd3d-wasm-build'
vkd3d_build.mkdir(exist_ok=True)
tool_paths = [str(pathlib.Path.home() / '.cargo/bin')]
for candidate in ['/opt/homebrew/opt/bison/bin', '/opt/homebrew/opt/flex/bin']:
    if pathlib.Path(candidate).is_dir():
        tool_paths.append(candidate)
env = dict(os.environ, PATH=':'.join(tool_paths + [os.environ['PATH']]))
env['CPPFLAGS'] = ' '.join([
    '-I' + str(vendor / 'spirv-headers/include'),
    '-I' + str(vendor / 'vulkan-headers/include'),
])
env['PTHREAD_LIBS'] = '-pthread'
env['SONAME_LIBVULKAN'] = 'libvulkan.so'
if not (vkd3d_build / 'Makefile').exists():
    subprocess.run([
        str(vendor / 'emsdk/upstream/emscripten/emconfigure'), str(vkd3d_source / 'configure'),
        '--disable-demos', '--disable-tests', '--without-opengl', '--without-ncurses',
        '--without-xcb', '--without-spirv-tools', 'WIDL=no',
    ], cwd=vkd3d_build, env=env, check=True)
emmake = str(vendor / 'emsdk/upstream/emscripten/emmake')
subprocess.run([emmake, 'make', 'include/private/vkd3d_version.h'], cwd=vkd3d_build, env=env, check=True)
subprocess.run([emmake, 'make', '-j2', 'libvkd3d-shader.la'], cwd=vkd3d_build, env=env, check=True)
subprocess.run([
    str(emcc), '-O2', '-DNDEBUG', '-DVKD3D_NO_TRACE_MESSAGES', '-DVKD3D_NO_DEBUG_MESSAGES',
    '-I' + str(vkd3d_source / 'include'), '-I' + str(vkd3d_source / 'include/private'),
    '-I' + str(vkd3d_build / 'include'), str(root / 'runtime/shaders/vkd3d_bridge.c'),
    str(vkd3d_build / '.libs/libvkd3d-shader.a'), str(vkd3d_build / '.libs/libvkd3d-common.a'),
    '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,worker,node', '-sFILESYSTEM=0',
    '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=16777216', '-sMAXIMUM_MEMORY=134217728',
    '-sSTACK_SIZE=1048576',
    '-sEXPORTED_FUNCTIONS=["_malloc","_free","_vkd3d_bridge_compile_pair","_vkd3d_bridge_reset","_vkd3d_bridge_output","_vkd3d_bridge_output_length","_vkd3d_bridge_error","_vkd3d_bridge_input_count","_vkd3d_bridge_input_register","_vkd3d_bridge_input_semantic_index","_vkd3d_bridge_input_semantic","_vkd3d_bridge_version"]',
    '-sEXPORTED_RUNTIME_METHODS=["UTF8ToString","HEAPU8"]', '-o', str(out / 'vkd3d_shader.js'),
], check=True)
normalize_generated_javascript(out / 'vkd3d_shader.js')
shutil.copy2(vkd3d_source / 'COPYING', out / 'vkd3d-COPYING')
shutil.copy2(vkd3d_source / 'LICENSE', out / 'vkd3d-LICENSE')

subprocess.run(['cargo', 'build', '--locked', '--manifest-path', str(root / 'runtime/shaders/Cargo.toml')], check=True, env=env)
subprocess.run(['cargo', 'build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '--manifest-path', str(root / 'runtime/shaders/Cargo.toml'), '--lib'], check=True, env=env)
subprocess.run([
    'wasm-bindgen', '--out-dir', str(out), '--out-name', 'shader_translation', '--target', 'web',
    str(root / 'runtime/shaders/target/wasm32-unknown-unknown/release/humus_shader_translation.wasm'),
], check=True, env=env)

# Test bytecode stays outside the original asset mount.
fixtures = json.loads((root / 'tests/shaders/fixtures.json').read_text())
for name in ['vertex', 'pixel', 'texture', 'vertexConstant', 'vertexExplicit', 'vertexExplicitSparse']:
    values = fixtures[name]
    (out / (name + '.bin')).write_bytes(struct.pack('<' + 'I' * len(values), *values))

artifacts = [
    'mojoshader.js', 'mojoshader.wasm', 'vkd3d_shader.js', 'vkd3d_shader.wasm',
    'vkd3d-COPYING', 'vkd3d-LICENSE', 'shader_translation.js', 'shader_translation_bg.wasm',
    'vertex.bin', 'pixel.bin', 'texture.bin', 'vertexConstant.bin', 'vertexExplicit.bin',
    'vertexExplicitSparse.bin',
]
manifest = {
    'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'builtAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'dependencies': deps,
    'vkd3dPatchSha256': hashlib.sha256((root / 'patches/vkd3d.patch').read_bytes()).hexdigest(),
    'artifacts': {name: {'sha256': hashlib.sha256((out / name).read_bytes()).hexdigest(), 'bytes': (out / name).stat().st_size} for name in artifacts},
}
(out / 'shader-build.json').write_text(json.dumps(manifest, indent=2) + '\n')
