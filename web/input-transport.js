import {enqueueInput} from './input-queue.js';

export function writeInputReply(buffer,address,message){
 if(!(buffer instanceof SharedArrayBuffer)||!Number.isInteger(address)||address<4||address%4||address+16>buffer.byteLength)throw Error('invalid input reply pointer');
 const words=new Int32Array(buffer);
 for(let i=1;i<4;i++)Atomics.store(words,address/4+i,message[i]);
 Atomics.store(words,address/4,message[0]);
 Atomics.notify(words,address/4,1);
}

/** A small input-only broker, kept independent from WebGPU rendering work. */
export class InputBroker{
 constructor(limit=256){this.limit=limit;this.queue=[];this.waiting=null;}
 request(func,buffer,address){
  if(!['poll_message','wait_message'].includes(func))throw Error(`unsupported input operation: ${func}`);
  if(!this.queue.length&&func==='wait_message'){
   if(this.waiting)throw Error('duplicate input wait');
   this.waiting={buffer,address};return;
  }
  writeInputReply(buffer,address,this.queue.shift()??[-1,0,0,0]);
 }
 push(message){
  // Validate through the same queue contract even when a waiter can consume
  // the event immediately.
  const validated=[];enqueueInput(validated,message,1);
  if(this.waiting){const waiting=this.waiting;this.waiting=null;writeInputReply(waiting.buffer,waiting.address,validated[0]);return true;}
  return enqueueInput(this.queue,validated[0],this.limit);
 }
}
