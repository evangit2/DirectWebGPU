import assert from 'node:assert/strict';
import {RUNTIME_MODES,runtimeMode,runtimeModeInfo} from '../web/runtime-mode.js';

assert.equal(runtimeMode(''),RUNTIME_MODES.WINED3D);
assert.equal(runtimeMode('?mode='),RUNTIME_MODES.WINED3D);
assert.equal(runtimeMode('?mode=wined3d-webgpu'),RUNTIME_MODES.WINED3D);
assert.equal(runtimeMode('?mode=legacy-win32'),RUNTIME_MODES.LEGACY);
assert.equal(runtimeModeInfo(RUNTIME_MODES.WINED3D).deprecated,false);
assert.equal(runtimeModeInfo(RUNTIME_MODES.LEGACY).deprecated,true);
assert.throws(()=>runtimeMode('?mode=unknown'),/unsupported DirectWebGPU mode/);

console.log('WineD3D is the default and legacy Win32 remains explicitly selectable');
