import assert from 'node:assert/strict';
import {InputBroker} from '../web/input-transport.js';

function reply(){return{buffer:new SharedArrayBuffer(32),address:4};}
function values(target){return Array.from(new Int32Array(target.buffer,target.address,4));}

const broker=new InputBroker(4),empty=reply();
broker.request('poll_message',empty.buffer,empty.address);
assert.deepEqual(values(empty),[-1,0,0,0]);

const waiting=reply();
broker.request('wait_message',waiting.buffer,waiting.address);
assert.deepEqual(values(waiting),[0,0,0,0]);
assert.equal(broker.push([5,0x48,0x26,1]),true);
assert.deepEqual(values(waiting),[5,0x48,0x26,1]);

assert.equal(broker.push([7,3,-2,0]),true);
assert.equal(broker.push([7,4,5,0x10000]),true);
const motion=reply();broker.request('poll_message',motion.buffer,motion.address);
assert.deepEqual(values(motion),[7,7,3,0x10000]);
assert.throws(()=>broker.push([8,0,0,0]),/invalid input message/);

console.log('Dedicated input transport polls, waits, validates, and coalesces motion');
