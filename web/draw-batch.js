// CPU-owned staging area. Ownership passes to the GPU worker until completion.
export const BATCH_BYTES=1048576, BATCH_COMMANDS=64;
export class DrawBatch {
 constructor(post,wait=words=>Atomics.wait(words,0,0)) {this.post=post;this.wait=wait;this.buffer=new SharedArrayBuffer(BATCH_BYTES+4096);this.control=new Int32Array(this.buffer,0,1);this.commands=[];this.offset=4096;this.failed=false;}
 enqueue(args,memory) {
  if(this.failed)throw Error('draw batch transport has failed');
  const [op,id,pointer,length]=args;
  if(args.length!==4||op!==13||!Number.isInteger(id)||id<1||id>0xffffffff||!(memory instanceof SharedArrayBuffer)||![pointer,length].every(Number.isInteger)||pointer<4096||pointer%4||length<5500||length>16384||length%4||pointer+length>memory.byteLength)throw RangeError('invalid queued draw packet range');
  if(this.commands.length===BATCH_COMMANDS||this.offset+length>this.buffer.byteLength)this.flush();
  new Uint8Array(this.buffer,this.offset,length).set(new Uint8Array(memory,pointer,length));
  this.commands.push([id,this.offset,length]);this.offset+=length;
 }
 flush() {
  if(this.failed)throw Error('draw batch transport has failed');
  if(!this.commands.length)return;
  Atomics.store(this.control,0,0);
  this.post({func:'draw_batch',buffer:this.buffer,commands:this.commands});
  while(Atomics.load(this.control,0)===0)this.wait(this.control);
  if(Atomics.load(this.control,0)!==1){this.failed=true;throw Error('deferred D3D9 draw failed; see GPU draw-rejected / gpu-error diagnostics');}
  this.commands=[];this.offset=4096;
 }
}
export async function executeDrawBatch(data,draw) {
 const {buffer,commands}=data;
 if(!(buffer instanceof SharedArrayBuffer)||buffer.byteLength!==BATCH_BYTES+4096)throw Error('invalid draw batch storage');
 const control=new Int32Array(buffer,0,1);let result=2;
 try {
  if(!Array.isArray(commands)||!commands.length||commands.length>BATCH_COMMANDS)throw Error('invalid draw batch count');
  let end=4096;
  for(const a of commands){if(!Array.isArray(a)||a.length!==3||a.some(v=>!Number.isInteger(v))||a[0]<1||a[0]>0xffffffff||a[1]!==end||a[2]<5500||a[2]>16384||a[2]%4||end+a[2]>buffer.byteLength)throw Error('invalid draw batch command');end+=a[2];}
  for(const a of commands)if(await draw(13,a,buffer)!==1)throw Error('queued draw rejected; remaining batch aborted');
  result=1;
 } finally {Atomics.store(control,0,result);Atomics.notify(control,0,1);}
}
