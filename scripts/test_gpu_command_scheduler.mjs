import assert from 'node:assert/strict';
import {GpuCommandScheduler} from '../web/gpu-command-scheduler.js';

let releaseFirst;
const gate=new Promise(resolve=>{releaseFirst=resolve;});
const visited=[],errors=[],depths=[];
const scheduler=new GpuCommandScheduler(async command=>{
 visited.push(command.id);
 if(command.id==='frame-1')await gate;
 if(command.id==='bad-audio')throw Error('audio failed');
},error=>errors.push(error.message),(pending,maxPending)=>depths.push([pending,maxPending]));

scheduler.enqueue({func:'draw_batch',id:'frame-1'});
await Promise.resolve();
for(let i=0;i<100;i++)scheduler.enqueue({func:'audio_write',id:`audio-${i}`});
scheduler.enqueue({func:'future_graphics_command',id:'frame-2'});
assert.equal(scheduler.pending,2);
assert.equal(scheduler.maxPending,2);
assert.equal(visited.filter(id=>id.startsWith('audio-')).length,100);
assert(!visited.includes('frame-2'));
releaseFirst();
await scheduler.idle();
assert.deepEqual(visited.filter(id=>id.startsWith('frame-')),['frame-1','frame-2']);
assert.equal(scheduler.pending,0);
assert.deepEqual(depths,[[1,1],[2,2],[1,2],[0,2]]);

scheduler.enqueue({func:'audio_write',id:'bad-audio'});
await Promise.resolve();await Promise.resolve();
assert.deepEqual(errors,['audio failed']);

const syncOrder=[],syncDepth=[];const syncScheduler=new GpuCommandScheduler(command=>syncOrder.push(command.id),()=>{},(pending,maxPending)=>syncDepth.push([pending,maxPending]));
for(let i=0;i<1000;i++)syncScheduler.enqueue({func:'draw_batch',id:i});
await syncScheduler.idle();assert.deepEqual(syncOrder,Array.from({length:1000},(_,i)=>i));assert.equal(syncScheduler.pending,0);assert.equal(syncScheduler.queue.length,0);assert(syncDepth.every(([pending,maxPending])=>pending<=1&&maxPending===1));
console.log('GPU scheduler separates real-time host traffic from ordered graphics');
