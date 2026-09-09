import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import initNaga from '../web/generated/shader_translation.js';
import {createVkd3dShaderTranslator} from '../web/vkd3d-shaders.js';
import {packShaderUniforms} from '../web/shader-uniforms.js';

await initNaga({module_or_path: readFileSync(new URL('../web/generated/shader_translation_bg.wasm', import.meta.url))});
const translator = await createVkd3dShaderTranslator();
const fixture = name => new Uint8Array(readFileSync(new URL(`../web/generated/${name}.bin`, import.meta.url)));
const declaration = new Uint8Array([
  0, 0, 0, 0, 3, 0, 0, 0,
  0, 0, 16, 0, 3, 0, 10, 0,
  255, 0, 0, 0, 17, 0, 0, 0,
]);

const explicit = translator.translatePair(fixture('vertexExplicit'), fixture('pixel'));
assert.equal(explicit.compiler, 'vkd3d-shader 2.1');
assert.deepEqual(explicit.vertex.inputs, [
  {usage: 0, index: 0, location: 0},
  {usage: 10, index: 0, location: 1},
]);
assert.doesNotMatch(explicit.vertex.wgsl, /point_size|PointSize/);

const external = translator.translatePair(fixture('vertex'), fixture('pixel'), {declaration});
assert.deepEqual(external.vertex.inputs, explicit.vertex.inputs);

const sparse = translator.translatePair(fixture('vertexExplicitSparse'), fixture('pixel'));
assert.deepEqual(sparse.vertex.inputs.map(input => input.location), [0, 9]);

const textured = translator.translatePair(fixture('vertexExplicit'), fixture('texture'));
assert.deepEqual(textured.pixel.samplers, [{
  group: 2, textureBinding: 0, samplerBinding: 1, sourceIndex: 0, dimension: 1,
}]);

const constant = translator.translatePair(fixture('vertexConstant'), fixture('pixel'), {declaration});
assert.deepEqual(constant.vertex.uniformBindings, [{binding: 0, offsetBytes: 0, sizeBytes: 128}]);
const registers = [new Uint32Array(1024), new Uint32Array(64), new Uint32Array(16)];
registers[0][7 * 4] = 0x3e800000;
const packed = packShaderUniforms(constant.vertex, registers);
assert.equal(packed.byteLength, 4608);
assert.equal(packed[7 * 4], 0x3e800000);

assert.throws(() => translator.translatePair(fixture('vertex').subarray(0, 8), fixture('pixel'), {declaration}));

const result = {
  kind: 'WineD3D shader compiler integration diagnostic; not executable rendering acceptance',
  result: 'passed',
  mode: translator.mode,
  compiler: explicit.compiler,
  checks: [
    'VS 1.1 and PS 2.0 compile through libvkd3d-shader to Naga-validated WGSL',
    'VS 1.x external vertex declarations are derived from the draw declaration',
    'sparse shader input locations are preserved',
    'separate texture and sampler bindings map back to the D3D sampler index',
    'reflected float constant buffers read the D3D register file',
    'malformed bytecode fails compilation',
  ],
  shaderBuild: JSON.parse(readFileSync(new URL('../web/generated/shader-build.json', import.meta.url))),
};
writeFileSync(new URL('../evidence/wined3d-shader-tests.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
