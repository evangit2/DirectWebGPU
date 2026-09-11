import assert from 'node:assert/strict';
import {audioQueueLimit,audioQueueNeedsReset} from '../web/audio-scheduling.js';

assert.equal(audioQueueLimit(false),0.6);
assert.equal(audioQueueLimit(true),0.3);
assert.equal(audioQueueNeedsReset(10.29,10,true),false);
assert.equal(audioQueueNeedsReset(10.31,10,true),true);
assert.equal(audioQueueNeedsReset(10.59,10,false),false);
assert.equal(audioQueueNeedsReset(10.61,10,false),true);
assert.equal(audioQueueNeedsReset(Number.NaN,10,true),false);

console.log('Streamed audio queue latency stays bounded by input class');
