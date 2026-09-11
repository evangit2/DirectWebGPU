import assert from 'node:assert/strict';
import {issueEventQuery,flushEventQuery} from '../web/event-query.js';

let complete;
const pending=new Promise(resolve=>{complete=resolve;});
let flushes=0;
const memory=new SharedArrayBuffer(8192),pointer=4096,words=new Int32Array(memory);
const backend={draws:{flush(){flushes++;}},equivalence:{flush(){flushes++;}}};
const device={queue:{onSubmittedWorkDone:()=>pending}};
Atomics.store(words,pointer/4,0);
assert.equal(issueEventQuery(device,backend,memory,pointer),1);
assert.equal(Atomics.load(words,pointer/4),0);
assert.equal(flushes,2);
complete();await pending;await Promise.resolve();
assert.equal(Atomics.load(words,pointer/4),1);

Atomics.store(words,pointer/4,0);flushes=0;
const immediate={queue:{onSubmittedWorkDone:async()=>{}}};
assert.equal(await flushEventQuery(immediate,backend,memory,pointer),1);
assert.equal(Atomics.load(words,pointer/4),1);
assert.equal(flushes,2);

for(const invalid of [0,4097,8192]){
 assert.throws(()=>issueEventQuery(immediate,backend,memory,invalid),RangeError);
 await assert.rejects(flushEventQuery(immediate,backend,memory,invalid),RangeError);
}
assert.throws(()=>issueEventQuery(immediate,backend,new ArrayBuffer(8192),pointer),RangeError);

let rejected;
const failed={queue:{onSubmittedWorkDone:()=>Promise.reject(Error('device lost'))}};
Atomics.store(words,pointer/4,0);
issueEventQuery(failed,backend,memory,pointer,error=>{rejected=error;});
await Promise.resolve();await Promise.resolve();
assert.match(String(rejected),/device lost/);
assert.equal(Atomics.load(words,pointer/4),0);
console.log('Event query markers preserve async completion, flush ordering, atomics and bounds');
