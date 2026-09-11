import {enqueueInput} from './input-queue.js';

const HEADER_WORDS=4,INPUT_CAPACITY=1024,MESSAGE_WORDS=4;

/** Single-producer/single-consumer input ring shared by the page and CPU worker. */
export function createSharedInputQueue(){
 return new SharedArrayBuffer((HEADER_WORDS+INPUT_CAPACITY*MESSAGE_WORDS)*Int32Array.BYTES_PER_ELEMENT);
}

export function pushSharedInput(buffer,message){
 const validated=[];enqueueInput(validated,message,1);
 if(!(buffer instanceof SharedArrayBuffer)||buffer.byteLength!==(HEADER_WORDS+INPUT_CAPACITY*MESSAGE_WORDS)*4)throw Error('invalid shared input queue');
 const words=new Int32Array(buffer),head=Atomics.load(words,0)>>>0,tail=Atomics.load(words,1)>>>0;
 if((tail-head)>>>0>=INPUT_CAPACITY){Atomics.add(words,2,1);return false;}
 const slot=HEADER_WORDS+(tail&(INPUT_CAPACITY-1))*MESSAGE_WORDS;
 for(let i=0;i<MESSAGE_WORDS;i++)Atomics.store(words,slot+i,validated[0][i]);
 Atomics.store(words,1,(tail+1)|0);Atomics.notify(words,1,1);return true;
}

export function takeSharedInput(buffer,wait=false){
 if(!(buffer instanceof SharedArrayBuffer)||buffer.byteLength!==(HEADER_WORDS+INPUT_CAPACITY*MESSAGE_WORDS)*4)throw Error('invalid shared input queue');
 const words=new Int32Array(buffer);
 for(;;){
  const head=Atomics.load(words,0)>>>0,tail=Atomics.load(words,1)>>>0;
  if(head!==tail){const slot=HEADER_WORDS+(head&(INPUT_CAPACITY-1))*MESSAGE_WORDS,out=Array.from(words.subarray(slot,slot+MESSAGE_WORDS));Atomics.store(words,0,(head+1)|0);return out;}
  if(!wait)return[-1,0,0,0];
  Atomics.wait(words,1,tail|0);
 }
}

export function sharedInputStats(buffer){const words=new Int32Array(buffer);return{queued:(Atomics.load(words,1)-Atomics.load(words,0))>>>0,dropped:Atomics.load(words,2)>>>0};}

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
