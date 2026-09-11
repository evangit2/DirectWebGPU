import assert from 'node:assert/strict';
import {DrawBatch,executeDrawBatch,BATCH_BYTES,BATCH_COMMANDS} from '../web/draw-batch.js';
const memory=new SharedArrayBuffer(20000),source=new Uint8Array(memory,4096,5500);source.fill(7);
const sent=[];const batch=new DrawBatch(data=>{sent.push({...data,commands:data.commands.map(a=>a.slice())});assert.equal(new Uint8Array(data.buffer,4096,1)[0],7);Atomics.store(new Int32Array(data.buffer),0,1);});
batch.enqueue([13,9,4096,5500],memory);source.fill(8);assert.equal(new Uint8Array(batch.buffer,4096,1)[0],7);source.fill(7);
for(let i=1;i<=BATCH_COMMANDS+1;i++)batch.enqueue([13,9,4096,5500],memory);
assert.equal(sent.length,1);assert.equal(sent[0].commands.length,BATCH_COMMANDS);batch.flush();assert.equal(sent.length,2);batch.flush();assert.equal(sent.length,2);
assert.throws(()=>batch.enqueue([13,9,19999,5500],memory),/range/);
assert.equal(batch.enqueue([13,9,4096,2048],memory),true);batch.commands.pop();batch.offset=4096;
assert.throws(()=>batch.enqueue([13,9,4096,2044],memory),/command/);
const buffer=new SharedArrayBuffer(BATCH_BYTES+4096),commands=[[13,9,4096,5500],[13,9,9596,5500]],order=[];
await executeDrawBatch({buffer,commands},async(op,a)=>{order.push(a[1]);return 1;});assert.deepEqual(order,[4096,9596]);assert.equal(new Int32Array(buffer)[0],1);
let calls=0;await assert.rejects(()=>executeDrawBatch({buffer,commands},async()=>{calls++;return 0x8876086c;}),/rejected/);assert.equal(calls,1);assert.equal(new Int32Array(buffer)[0],2);
await assert.rejects(()=>executeDrawBatch({buffer,commands:[[13,9,4096,5500],[13,9,4096,5500]]},async()=>{throw Error('must prevalidate');}),/command/);
const failure=new DrawBatch(data=>Atomics.store(new Int32Array(data.buffer),0,2));failure.enqueue([13,9,4096,5500],memory);assert.throws(()=>failure.flush(),/deferred/);assert.throws(()=>failure.enqueue([13,9,4096,5500],memory),/failed/);
console.log(`Draw batch ownership, ${BATCH_COMMANDS}-command bound, pointer validation, ordering and fail-stop tests passed`);
// Exercise the real blocking handoff, including notification before/after wait.
const {Worker}=await import('node:worker_threads');
const worker=new Worker(`const {parentPort}=require('node:worker_threads'); import(${JSON.stringify(new URL('../web/draw-batch.js',import.meta.url).href)}).then(({executeDrawBatch})=>parentPort.on('message',data=>executeDrawBatch(data,async()=>1)));`,{eval:true});
try{const concurrent=new DrawBatch(data=>worker.postMessage(data));concurrent.enqueue([13,9,4096,5500],memory);concurrent.flush();assert.equal(concurrent.commands.length,0);concurrent.drain();}finally{await worker.terminate();}
console.log('Cross-worker Atomics handoff passed');

// Mixed updates retain source bytes and execute before later consumers.
const mixed=new DrawBatch(data=>Atomics.store(new Int32Array(data.buffer),0,1));
source.fill(3);mixed.enqueue([3,9,3,0xff102030,0x3f800000,0],memory);mixed.enqueue([6,9,2,0,4096,8],memory);mixed.enqueue([13,9,4096,5500],memory);mixed.enqueue([11,9,3,0,4096,1,1],memory);mixed.enqueue([13,9,4096,5500],memory);source.fill(9);
const visited=[];await executeDrawBatch({buffer:mixed.buffer,commands:mixed.commands},async(op,a,b)=>{visited.push(op);if(op!==3)assert.equal(new Uint8Array(b,op===13?a[1]:a[3],1)[0],3);return 1;});
assert.deepEqual(visited,[3,6,13,11,13]);assert.equal(mixed.commands[4][2]%4,0);
const large=new SharedArrayBuffer(BATCH_BYTES+8192);assert.equal(mixed.enqueue([6,9,2,0,4096,BATCH_BYTES+4],large),false);assert.equal(mixed.commands.length,5);
console.log('Mixed upload/draw order, copied bytes, alignment and large-upload fallback passed');
const failedOrder=[];await assert.rejects(()=>executeDrawBatch({buffer:mixed.buffer,commands:mixed.commands},async op=>{failedOrder.push(op);return op===11?0x8876086c:1;}),/rejected/);assert.deepEqual(failedOrder,[3,6,13,11]);assert.equal(new Int32Array(mixed.buffer)[0],2);
console.log('Rejected texture update aborts subsequent draws and wakes the CPU');
const frames=[];const framed=new DrawBatch(data=>{frames.push({...data,commands:data.commands.map(a=>a.slice())});Atomics.store(new Int32Array(data.buffer),0,1)});
framed.enqueue([3,9,3,0xff102030,0x3f800000,0],memory);assert.equal(framed.enqueue([4,9],memory),true);framed.flush();
assert.equal(frames.length,1);await executeDrawBatch(frames[0],async()=>1);
assert.throws(()=>framed.enqueue([4,9,1],memory),/command/);
console.log('Present is a validated draw-batch frame boundary');
