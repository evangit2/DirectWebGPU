import createVkd3d from './generated/vkd3d_shader.js';
import initNaga, {alpha_test_wgsl, shader_bindings, spirv_to_wgsl, vertex_inputs_wgsl, vertex_position_wgsl} from './generated/shader_translation.js';

const MAX_SHADER_BYTES = 1024 * 1024;
const SEMANTICS = new Map([
  ['POSITION', 0], ['BLENDWEIGHT', 1], ['BLENDINDICES', 2], ['NORMAL', 3],
  ['PSIZE', 4], ['TEXCOORD', 5], ['TANGENT', 6], ['BINORMAL', 7],
  ['TESSFACTOR', 8], ['POSITIONT', 9], ['COLOR', 10], ['FOG', 11],
  ['DEPTH', 12], ['SAMPLE', 13],
]);
const REGISTER_BASE = [0, 4096, 4352];

function canonicalFloatLimits(source) {
  return source.replace(/\b340282350000000000000000000000000000000f\b/g, '0x1.fffffep+127f');
}

function profile(stage, bytes) {
  if (![0, 1].includes(stage) || !(bytes instanceof Uint8Array)
      || bytes.length < 8 || bytes.length > MAX_SHADER_BYTES || bytes.length % 4) {
    throw new RangeError('invalid shader bytecode range');
  }
  const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  if ((version >>> 16) !== (stage ? 0xffff : 0xfffe)) throw new RangeError('shader stage does not match bytecode profile');
  const major = (version >>> 8) & 0xff;
  if (major < 1 || major > 3) throw new RangeError(`unsupported shader model ${major}`);
  return {version, major, minor: version & 0xff};
}

function declarationDcls(declaration) {
  if (!(declaration instanceof Uint8Array) || declaration.length < 16 || declaration.length > 520 || declaration.length % 8) {
    throw new RangeError('invalid vertex declaration for VS 1.x');
  }
  const view = new DataView(declaration.buffer, declaration.byteOffset, declaration.byteLength);
  const dwords = [];
  let register = 0;
  for (let offset = 0; offset < declaration.length; offset += 8) {
    const stream = view.getUint16(offset, true);
    const elementOffset = view.getUint16(offset + 2, true);
    const type = declaration[offset + 4];
    const method = declaration[offset + 5];
    const usage = declaration[offset + 6];
    const index = declaration[offset + 7];
    if (stream === 255 && elementOffset === 0 && type === 17 && method === 0 && usage === 0 && index === 0) break;
    if (stream >= 16 || method !== 0 || usage > 13 || index > 15 || register >= 16) throw new RangeError('unsupported VS 1.x declaration element');
    dwords.push(31, 0x80000000 | usage | (index << 16), 0x900f0000 | register++);
  }
  if (!dwords.length) throw new RangeError('VS 1.x declaration has no elements');
  return dwords;
}

function withExternalDeclaration(bytes, declaration) {
  const p = profile(0, bytes);
  if (p.major !== 1) return bytes;
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  if ((words[1] & 0xffff) === 31) return bytes;
  const dcls = declarationDcls(declaration);
  const output = new Uint32Array(words.length + dcls.length);
  output[0] = words[0];
  output.set(dcls, 1);
  output.set(words.subarray(1), 1 + dcls.length);
  return new Uint8Array(output.buffer);
}

function reflectStage(spv, stage) {
  const raw = Array.from(shader_bindings(spv));
  if (raw.length % 4 || raw.length > 256) throw new Error('invalid vkd3d resource reflection');
  const resources = Array.from({length: raw.length / 4}, (_, i) => ({
    group: raw[i * 4], binding: raw[i * 4 + 1], kind: raw[i * 4 + 2], detail: raw[i * 4 + 3],
  }));
  const group = stage ? 3 : 1;
  const uniforms = [], uniformBindings = [];
  for (const resource of resources.filter(r => r.kind === 0)) {
    if (resource.group !== group || resource.binding > 2 || !resource.detail || resource.detail > 4096 || resource.detail % 16) {
      throw new RangeError('unsupported vkd3d constant-buffer layout');
    }
    const count = resource.detail / 16;
    uniforms.push({type: resource.binding, index: 0, count, constant: false});
    uniformBindings.push({binding: resource.binding, offsetBytes: REGISTER_BASE[resource.binding], sizeBytes: resource.detail});
  }
  const handles = resources.filter(r => r.group === 2 && r.kind !== 0);
  const samplers = [];
  for (const texture of handles.filter(r => r.kind === 1)) {
    if (texture.binding % 2) throw new RangeError('unexpected vkd3d texture binding');
    const sourceIndex = texture.binding / 2;
    const samplerBinding = sourceIndex * 2 + 1;
    if (!handles.some(r => r.kind === 2 && r.binding === samplerBinding)) throw new RangeError('vkd3d texture has no paired sampler');
    samplers.push({group: 2, textureBinding: texture.binding, samplerBinding, sourceIndex, dimension: texture.detail});
  }
  return {
    samplers,
    spirvBytes: spv.length,
    wgsl: canonicalFloatLimits(spirv_to_wgsl(spv)),
    uniformGroup: group,
    uniforms,
    uniformBindings,
    constants: [],
  };
}

let initialized;
export async function createVkd3dShaderTranslator() {
  initialized ??= Promise.all([createVkd3d(), initNaga()]);
  const [vkd3d] = await initialized;
  return {
    mode: 'wined3d-webgpu',
    validate(stage, bytes) { profile(stage, bytes); },
    vertexPosition: (...args) => canonicalFloatLimits(vertex_position_wgsl(...args)),
    vertexInputs: (...args) => canonicalFloatLimits(vertex_inputs_wgsl(...args)),
    alphaTest: (...args) => canonicalFloatLimits(alpha_test_wgsl(...args)),
    translatePair(vertexInput, pixel, {declaration} = {}) {
      profile(0, vertexInput); profile(1, pixel);
      const vertex = withExternalDeclaration(vertexInput, declaration);
      let vp = 0, pp = 0;
      try {
        vp = vkd3d._malloc(vertex.length); pp = vkd3d._malloc(pixel.length);
        if (!vp || !pp) throw new Error('vkd3d shader allocation failed');
        vkd3d.HEAPU8.set(vertex, vp); vkd3d.HEAPU8.set(pixel, pp);
        if (!vkd3d._vkd3d_bridge_compile_pair(vp, vertex.length, pp, pixel.length)) {
          const errors = [0, 1].map(stage => vkd3d.UTF8ToString(vkd3d._vkd3d_bridge_error(stage))).filter(Boolean);
          throw new Error(errors.join(' | ') || 'vkd3d shader compilation failed');
        }
        const stages = [0, 1].map(stage => {
          const pointer = vkd3d._vkd3d_bridge_output(stage);
          const length = vkd3d._vkd3d_bridge_output_length(stage);
          if (!pointer || length < 20 || length > 4 * 1024 * 1024 || pointer + length > vkd3d.HEAPU8.length) {
            throw new Error('invalid vkd3d SPIR-V bounds');
          }
          return reflectStage(vkd3d.HEAPU8.slice(pointer, pointer + length), stage);
        });
        const inputCount = vkd3d._vkd3d_bridge_input_count();
        if (inputCount > 16) throw new RangeError('too many vkd3d vertex inputs');
        stages[0].inputs = Array.from({length: inputCount}, (_, index) => {
          const semantic = vkd3d.UTF8ToString(vkd3d._vkd3d_bridge_input_semantic(index)).toUpperCase();
          const usage = SEMANTICS.get(semantic);
          const location = vkd3d._vkd3d_bridge_input_register(index);
          const semanticIndex = vkd3d._vkd3d_bridge_input_semantic_index(index);
          if (usage === undefined || location >= 16 || semanticIndex >= 16) throw new RangeError(`unsupported vkd3d vertex semantic ${semantic}${semanticIndex}`);
          return {usage, index: semanticIndex, location};
        });
        return {vertex: stages[0], pixel: stages[1], compiler: vkd3d.UTF8ToString(vkd3d._vkd3d_bridge_version())};
      } finally {
        vkd3d._vkd3d_bridge_reset();
        if (vp) vkd3d._free(vp);
        if (pp) vkd3d._free(pp);
      }
    },
  };
}
