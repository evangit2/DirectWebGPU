import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {DrawBatch,executeDrawBatch,BATCH_BYTES,BATCH_COMMANDS,BATCH_HEADER_BYTES,BATCH_RECORD_WORDS} from '../web/draw-batch.js';

const memory=new SharedArrayBuffer(20000),source=new Uint8Array(memory,4096,5500);source.fill(7);
const batchCount=data=>Atomics.load(new Uint32Array(data.buffer,0,2),1);
const release=data=>Atomics.store(new Int32Array(data.buffer),0,1);

const sent=[];
const batch=new DrawBatch(data=>{
 sent.push(data);
 assert.equal(new Uint8Array(data.buffer,BATCH_HEADER_BYTES,1)[0],7);
 release(data);
});
batch.enqueue([13,9,4096,5500],memory);
source.fill(8);assert.equal(new Uint8Array(batch.buffer,BATCH_HEADER_BYTES,1)[0],7);source.fill(7);
for(let i=1;i<=BATCH_COMMANDS+1;i++)batch.enqueue([13,9,4096,5500],memory);
assert.equal(sent.length,1);assert.equal(batchCount(sent[0]),BATCH_COMMANDS);
batch.flush();assert.equal(sent.length,2);assert.equal(batchCount(sent[1]),2);batch.flush();assert.equal(sent.length,2);
assert.throws(()=>batch.enqueue([13,9,19999,5500],memory),/range/);
assert.equal(batch.enqueue([13,9,4096,2048],memory),true);batch.count--;batch.offset=BATCH_HEADER_BYTES;
assert.throws(()=>batch.enqueue([13,9,4096,2044],memory),/command/);

const queued=[];const producer=new DrawBatch(data=>queued.push(data));
producer.enqueue([13,9,4096,5500],memory);producer.enqueue([13,9,4096,5500],memory);producer.flush();
const order=[];
const summary=await executeDrawBatch(queued[0],()=>{throw Error('draw fast path expected')},(id,pointer,length,buffer)=>{assert.equal(id,9);assert.equal(length,5500);assert.equal(new Uint8Array(buffer,pointer,1)[0],7);order.push(pointer);return 1;});
assert.deepEqual(order,[BATCH_HEADER_BYTES,BATCH_HEADER_BYTES+5500]);assert.deepEqual(summary,{commands:2,clears:0,draws:2,uploads:0,uploadedBytes:0});assert.equal(new Int32Array(queued[0].buffer)[0],1);

const rejected=[];const rejectionProducer=new DrawBatch(data=>rejected.push(data));
rejectionProducer.enqueue([13,9,4096,5500],memory);rejectionProducer.flush();
let calls=0;await assert.rejects(()=>executeDrawBatch(rejected[0],async()=>{calls++;return 0x8876086c;}),/rejected/);assert.equal(calls,1);assert.equal(new Int32Array(rejected[0].buffer)[0],2);

const malformed=[];const malformedProducer=new DrawBatch(data=>malformed.push(data));
malformedProducer.enqueue([13,9,4096,5500],memory);malformedProducer.enqueue([13,9,4096,5500],memory);malformedProducer.flush();
const malformedWords=new Uint32Array(malformed[0].buffer,0,BATCH_HEADER_BYTES/4);
malformedWords[2+BATCH_RECORD_WORDS+1+2]=BATCH_HEADER_BYTES;
await assert.rejects(()=>executeDrawBatch(malformed[0],async()=>{throw Error('must prevalidate');}),/command/);

const failure=new DrawBatch(data=>Atomics.store(new Int32Array(data.buffer),0,2));failure.enqueue([13,9,4096,5500],memory);assert.throws(()=>failure.flush(),/deferred/);assert.throws(()=>failure.enqueue([13,9,4096,5500],memory),/failed/);
console.log(`Draw batch shared records, ownership, ${BATCH_COMMANDS}-command bound, pointer validation, ordering and fail-stop tests passed`);

// Exercise the real blocking handoff, including notification before/after wait.
const worker=new Worker(`const {parentPort}=require('node:worker_threads'); import(${JSON.stringify(new URL('../web/draw-batch.js',import.meta.url).href)}).then(({executeDrawBatch})=>parentPort.on('message',data=>executeDrawBatch(data,async()=>1)));`,{eval:true});
try{const concurrent=new DrawBatch(data=>worker.postMessage(data));concurrent.enqueue([13,9,4096,5500],memory);concurrent.flush();assert.equal(concurrent.count,0);concurrent.drain();}finally{await worker.terminate();}
console.log('Cross-worker Atomics handoff passed');

// Mixed updates retain source bytes and execute before later consumers.
const mixedMessages=[];const mixed=new DrawBatch(data=>mixedMessages.push(data));
source.fill(3);mixed.enqueue([3,9,3,0xff102030,0x3f800000,0],memory);mixed.enqueue([6,9,2,0,4096,8],memory);mixed.enqueue([13,9,4096,5500],memory);mixed.enqueue([11,9,3,0,4096,1,1],memory);mixed.enqueue([13,9,4096,5500],memory);source.fill(9);mixed.flush();
const visited=[];const mixedSummary=await executeDrawBatch(mixedMessages[0],async(op,a,b)=>{visited.push(op);if(op!==3)assert.equal(new Uint8Array(b,op===13?a[1]:a[3],1)[0],3);return 1;});
assert.deepEqual(visited,[3,6,13,11,13]);assert.deepEqual(mixedSummary,{commands:5,clears:1,draws:2,uploads:2,uploadedBytes:9});
const large=new SharedArrayBuffer(BATCH_BYTES+8192);assert.equal(mixed.enqueue([6,9,2,0,4096,BATCH_BYTES+4],large),false);assert.equal(mixed.count,0);
console.log('Mixed upload/draw order, copied bytes, alignment and large-upload fallback passed');

const failedMessages=[];const failedMixed=new DrawBatch(data=>failedMessages.push(data));
source.fill(3);failedMixed.enqueue([3,9,3,0xff102030,0x3f800000,0],memory);failedMixed.enqueue([6,9,2,0,4096,8],memory);failedMixed.enqueue([13,9,4096,5500],memory);failedMixed.enqueue([11,9,3,0,4096,1,1],memory);failedMixed.enqueue([13,9,4096,5500],memory);failedMixed.flush();
const failedOrder=[];await assert.rejects(()=>executeDrawBatch(failedMessages[0],async op=>{failedOrder.push(op);return op===11?0x8876086c:1;}),/rejected/);assert.deepEqual(failedOrder,[3,6,13,11]);assert.equal(new Int32Array(failedMessages[0].buffer)[0],2);
console.log('Rejected texture update aborts subsequent draws and wakes the CPU');

const frames=[];const framed=new DrawBatch(data=>{frames.push(data);release(data)});
framed.enqueue([3,9,3,0xff102030,0x3f800000,0],memory);assert.equal(framed.enqueue([4,9],memory),true);framed.flush();
assert.equal(frames.length,1);assert.equal(batchCount(frames[0]),2);
assert.throws(()=>framed.enqueue([4,9,1],memory),/command/);
console.log('Present is a validated shared-record frame boundary');
