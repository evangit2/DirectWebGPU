// CPU-owned staging for ordered draws and resource updates. The GPU worker owns
// the storage until completion; creations/destruction and other RPCs flush it.
export const BATCH_BYTES=1048576, BATCH_COMMANDS=64;
function layout(a){
 if(!Array.isArray(a)||a.some(v=>!Number.isInteger(v)||v<0||v>0xffffffff)||a[1]<1)throw RangeError('invalid queued command args');
 if(a[0]===13&&a.length===4&&a[3]>=5500&&a[3]<=16384&&a[3]%4===0)return {pointer:2,length:3};
 if(a[0]===6&&a.length===6&&a[2]>0&&a[3]%4===0&&a[5]>0&&a[5]%4===0)return {pointer:4,length:5};
 if(a[0]===11&&a.length===7&&a[2]>0&&a[5]>0&&a[6]>0)return {pointer:4,length:6};
 throw RangeError('invalid queued draw/upload command');
}
export class DrawBatch {
 constructor(post,wait=words=>Atomics.wait(words,0,0)) {this.post=post;this.wait=wait;this.buffer=new SharedArrayBuffer(BATCH_BYTES+4096);this.control=new Int32Array(this.buffer,0,1);this.commands=[];this.offset=4096;this.failed=false;}
 enqueue(args,memory) {
  if(this.failed)throw Error('graphics batch transport has failed');
  const spec=layout(args),pointer=args[spec.pointer],length=args[spec.length];
  if(!(memory instanceof SharedArrayBuffer)||pointer<4096||(args[0]===13&&pointer%4)||pointer+length>memory.byteLength)throw RangeError('invalid queued packet range');
  // Large uploads retain the existing bounded synchronous resource path.
  if(length>BATCH_BYTES)return false;
  if(this.commands.length===BATCH_COMMANDS||this.offset+length>this.buffer.byteLength)this.flush();
  new Uint8Array(this.buffer,this.offset,length).set(new Uint8Array(memory,pointer,length));
  const copied=[...args];copied[spec.pointer]=this.offset;this.commands.push(copied);this.offset+=Math.ceil(length/4)*4;return true;
 }
 flush() {
  if(this.failed)throw Error('graphics batch transport has failed');
  if(!this.commands.length)return;
  Atomics.store(this.control,0,0);
  this.post({func:'draw_batch',buffer:this.buffer,commands:this.commands});
  while(Atomics.load(this.control,0)===0)this.wait(this.control);
  if(Atomics.load(this.control,0)!==1){this.failed=true;throw Error('deferred D3D9 draw/upload failed; see GPU diagnostics');}
  this.commands=[];this.offset=4096;
 }
}
export async function executeDrawBatch(data,graphics) {
 const {buffer,commands}=data;
 if(!(buffer instanceof SharedArrayBuffer)||buffer.byteLength!==BATCH_BYTES+4096)throw Error('invalid graphics batch storage');
 const control=new Int32Array(buffer,0,1);let result=2;
 try {
  if(!Array.isArray(commands)||!commands.length||commands.length>BATCH_COMMANDS)throw Error('invalid graphics batch count');
  let end=4096;
  for(const a of commands){const s=layout(a);if(a[s.pointer]!==end||end+a[s.length]>buffer.byteLength)throw Error('invalid graphics batch command');end+=Math.ceil(a[s.length]/4)*4;}
  for(const a of commands)if(await graphics(a[0],a.slice(1),buffer)!==1)throw Error('queued draw/upload rejected; remaining batch aborted');
  result=1;
 } finally {Atomics.store(control,0,result);Atomics.notify(control,0,1);}
}
