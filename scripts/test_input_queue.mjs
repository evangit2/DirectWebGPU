import assert from 'node:assert/strict';
import {enqueueInput} from '../web/input-queue.js';

const queue=[];
assert.equal(enqueueInput(queue,[7,3,-2,0]),true);
assert.equal(enqueueInput(queue,[7,4,5,0x10000]),true);
assert.deepEqual(queue,[[7,7,3,0x10000]]);
assert.equal(enqueueInput(queue,[4,10,20,0]),true);
assert.equal(enqueueInput(queue,[4,30,40,0]),true);
assert.deepEqual(queue.at(-1),[4,30,40,0]);
assert.equal(enqueueInput(queue,[5,0x48,0x26,1]),true);
assert.equal(enqueueInput(queue,[6,0x48,0x26,1],3),false);
assert.throws(()=>enqueueInput(queue,[8,0,0,0]),/invalid input message/);

console.log('Input queue preserves accumulated relative motion and bounds events');
