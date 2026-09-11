// CPU-owned staging for ordered draws and resource updates. The GPU worker owns
// the storage until completion; creations/destruction and other RPCs flush it.
export const BATCH_BYTES=8*1048576, BATCH_COMMANDS=512;
export const BATCH_HEADER_BYTES=20*1024, BATCH_RECORD_WORDS=8;
const CONTROL_WORD=0,COUNT_WORD=1,FIRST_RECORD_WORD=2;
function layout(a){
 if(!Array.isArray(a)||a.some(v=>!Number.isInteger(v)||v<0||v>0xffffffff)||a[1]<1)throw RangeError('invalid queued command args');
 if(a[0]===4&&a.length===2)return {};
 if(a[0]===3&&a.length===6)return {};
 if(a[0]===13&&a.length===4&&a[3]>=2048&&a[3]<=16384&&a[3]%4===0)return {pointer:2,length:3};
 if(a[0]===6&&a.length===6&&a[2]>0&&a[3]%4===0&&a[5]>0&&a[5]%4===0)return {pointer:4,length:5};
 if(a[0]===11&&a.length===7&&a[2]>0&&a[5]>0&&a[6]>0)return {pointer:4,length:6};
 throw RangeError('invalid queued draw/upload command');
}
function recordCommand(words,index,args,pointerIndex=-1,pointerValue=0){
 const base=FIRST_RECORD_WORD+index*BATCH_RECORD_WORDS;
 words[base]=args.length;
 for(let i=0;i<args.length;i++)words[base+1+i]=(i===pointerIndex?pointerValue:args[i])>>>0;
}
function readCommand(words,index,target){
 const base=FIRST_RECORD_WORD+index*BATCH_RECORD_WORDS,length=words[base];
 if(length<1||length>=BATCH_RECORD_WORDS)throw Error('invalid graphics batch record');
 target.length=length;for(let i=0;i<length;i++)target[i]=words[base+1+i];return target;
}
export class DrawBatch {
 constructor(post,wait=words=>Atomics.wait(words,0,0),depth=2) {
  if(!Number.isInteger(depth)||depth<1||depth>4)throw RangeError('invalid draw batch depth');
  this.post=post;this.wait=wait;this.buffers=Array.from({length:depth},()=>new SharedArrayBuffer(BATCH_BYTES+BATCH_HEADER_BYTES));
  for(const buffer of this.buffers)Atomics.store(new Int32Array(buffer,0,1),0,1);
  this.index=0;this.count=0;this.offset=BATCH_HEADER_BYTES;this.failed=false;
 }
 get buffer(){return this.buffers[this.index]}
 get control(){return new Int32Array(this.buffer,0,1)}
 get words(){return new Uint32Array(this.buffer,0,BATCH_HEADER_BYTES/4)}
 acquire(buffer){
  const control=new Int32Array(buffer,0,1);
  while(Atomics.load(control,0)===0)this.wait(control);
  if(Atomics.load(control,0)!==1){this.failed=true;throw Error('deferred D3D9 draw/upload failed; see GPU diagnostics');}
 }
 enqueue(args,memory) {
  if(this.failed)throw Error('graphics batch transport has failed');
  const spec=layout(args);
  if(spec.pointer===undefined){
   if(this.count===BATCH_COMMANDS)this.flush();
   recordCommand(this.words,this.count++,args);return true;
  }
  const pointer=args[spec.pointer],length=args[spec.length];
  if(!(memory instanceof SharedArrayBuffer)||pointer<4096||(args[0]===13&&pointer%4)||pointer+length>memory.byteLength)throw RangeError('invalid queued packet range');
  // Large uploads retain the existing bounded synchronous resource path.
  if(length>BATCH_BYTES)return false;
  if(this.count===BATCH_COMMANDS||this.offset+length>this.buffer.byteLength)this.flush();
  new Uint8Array(this.buffer,this.offset,length).set(new Uint8Array(memory,pointer,length));
  recordCommand(this.words,this.count++,args,spec.pointer,this.offset);this.offset+=Math.ceil(length/4)*4;return true;
 }
 flush() {
  if(this.failed)throw Error('graphics batch transport has failed');
  if(!this.count)return;
  const outgoing=this.buffer,control=new Int32Array(outgoing,0,1);
  Atomics.store(new Int32Array(outgoing,0,2),COUNT_WORD,this.count);
  Atomics.store(control,0,0);
  this.post({func:'draw_batch',buffer:outgoing});
  // Synchronous transports (including tests) can report failure immediately.
  if(Atomics.load(control,0)>1){this.failed=true;throw Error('deferred D3D9 draw/upload failed; see GPU diagnostics');}
  this.index=(this.index+1)%this.buffers.length;
  this.acquire(this.buffer);
  this.count=0;this.offset=BATCH_HEADER_BYTES;
 }
 drain(){this.flush();for(const buffer of this.buffers)this.acquire(buffer)}
}
export async function executeDrawBatch(data,graphics,fastDraw=null) {
 const {buffer}=data;
  if(!(buffer instanceof SharedArrayBuffer)||buffer.byteLength!==BATCH_BYTES+BATCH_HEADER_BYTES)throw Error('invalid graphics batch storage');
 const control=new Int32Array(buffer,0,1);let result=2;
 try {
  const words=new Uint32Array(buffer,0,BATCH_HEADER_BYTES/4),count=Atomics.load(words,COUNT_WORD),command=[];
  if(count<1||count>BATCH_COMMANDS)throw Error('invalid graphics batch count');
  let end=BATCH_HEADER_BYTES;
  for(let i=0;i<count;i++){const a=readCommand(words,i,command),s=layout(a);if(s.pointer===undefined)continue;if(a[s.pointer]!==end||end+a[s.length]>buffer.byteLength)throw Error('invalid graphics batch command');end+=Math.ceil(a[s.length]/4)*4;}
  const args=[],summary={commands:count,clears:0,draws:0,uploads:0,uploadedBytes:0};
  for(let i=0;i<count;i++){
   const a=readCommand(words,i,command),op=a[0];let pending;
   if(fastDraw&&op===13)pending=fastDraw(a[1],a[2],a[3],buffer);
   else{args.length=a.length-1;for(let j=1;j<a.length;j++)args[j-1]=a[j];pending=graphics(op,args,buffer);}
   const result=pending?.then?await pending:pending;
   if(result!==1)throw Error(`queued draw/upload rejected: op=${op} result=0x${(result>>>0).toString(16)} args=${JSON.stringify(a.slice(1))}`);
   if(op===3)summary.clears++;else if(op===13)summary.draws++;else if(op===6||op===11){summary.uploads++;summary.uploadedBytes+=a[a.length-1];}
  }
  result=1;return summary;
 } finally {Atomics.store(control,0,result);Atomics.notify(control,0,1);}
}
