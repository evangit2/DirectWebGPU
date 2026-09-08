import assert from 'node:assert/strict';
import {summarizeTimestamps} from '../web/gpu-timing.js';
const r=summarizeTimestamps(new BigUint64Array([100n,1000100n,2000000n,2000000n]),2);assert.equal(r.sumDrawPassMs,1);assert.equal(r.zeroDurationPasses,1);assert.equal(r.maxDrawPassMs,1);
assert.throws(()=>summarizeTimestamps(new BigUint64Array([2n,1n]),1));assert.throws(()=>summarizeTimestamps(new BigUint64Array(256),129));assert.throws(()=>summarizeTimestamps(new BigUint64Array(1),1));console.log('Timestamp units, zero-duration quantization, ordering and count bounds passed');
