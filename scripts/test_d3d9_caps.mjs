import assert from 'node:assert/strict';
import {deviceCaps,supportsFormat} from '../web/d3d9-caps.js';

const caps=deviceCaps(),cube=0x800,mipCube=0x10000,cubePow2=0x20000;
assert.equal(caps.length,76);
assert.equal(caps[15]&(cube|mipCube|cubePow2),cube|mipCube|cubePow2);
assert.equal(caps[17],caps[16]);
const uncompressed={features:new Set()};
assert.equal(supportsFormat(uncompressed,0,5,21),true);
assert.equal(supportsFormat(uncompressed,0x200,5,22),true);
assert.equal(supportsFormat(uncompressed,1,5,21),true);
assert.equal(supportsFormat(uncompressed,1,3,22),true);
assert.equal(supportsFormat(uncompressed,1,5,23),false);
assert.equal(supportsFormat(uncompressed,0,4,21),false);
assert.equal(supportsFormat(uncompressed,0,5,0x31545844),false);
assert.equal(supportsFormat({features:new Set(['texture-compression-bc'])},0,5,0x31545844),true);
console.log('D3D8/9 sampled cube capabilities and format checks passed');
