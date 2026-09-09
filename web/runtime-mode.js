export const RUNTIME_MODES = Object.freeze({
  LEGACY: 'legacy-win32',
  WINED3D: 'wined3d-webgpu',
});

export function runtimeMode(search = globalThis.location?.search ?? '') {
  const requested = new URLSearchParams(search).get('mode');
  if (requested === null || requested === '') return RUNTIME_MODES.LEGACY;
  if (requested === RUNTIME_MODES.LEGACY || requested === RUNTIME_MODES.WINED3D) return requested;
  throw new RangeError(`unsupported DirectWebGPU mode: ${requested}`);
}

export function runtimeModeInfo(mode) {
  if (mode === RUNTIME_MODES.LEGACY) {
    return {mode, deprecated: true, shaderCompiler: 'MojoShader', compatibilityCore: 'DirectWebGPU lightweight Win32/D3D'};
  }
  if (mode === RUNTIME_MODES.WINED3D) {
    return {mode, deprecated: false, shaderCompiler: 'vkd3d-shader', compatibilityCore: 'DirectWebGPU Win32 with WineD3D semantics in progress'};
  }
  throw new RangeError(`unsupported DirectWebGPU mode: ${mode}`);
}
