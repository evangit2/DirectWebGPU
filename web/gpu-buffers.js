// Persistent geometry storage. Guest uploads are consumed before the RPC reply.
export class GeometryBuffers {
 constructor(device){this.device=device;this.items=new Map();this.nextId=1;this.bytes=0;}
 async create(kind,size,format){
  if(![6,7].includes(kind)||!Number.isInteger(size)||size<1||size>64*1024*1024||
     (kind===6?format!==100:![101,102].includes(format))||
     (kind===7&&size%(format===101?2:4)))throw RangeError('unsupported geometry buffer description');
  const padded=Math.ceil(size/4)*4;
  if(this.items.size>=4096||this.bytes+padded>128*1024*1024)throw RangeError('geometry buffer budget exceeded');
  if(this.nextId>=0x80000000)throw RangeError('geometry handle space exhausted');
  const d=this.device;d.pushErrorScope('validation');d.pushErrorScope('out-of-memory');
  let buffer;
  try{buffer=d.createBuffer({label:kind===6?'D3D9 vertex buffer':'D3D9 index buffer',size:padded,usage:(kind===6?GPUBufferUsage.VERTEX:GPUBufferUsage.INDEX)|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});}
  finally{const oom=await d.popErrorScope(),validation=await d.popErrorScope();if(oom||validation){buffer?.destroy();throw Error((oom??validation).message)}}
  const id=this.nextId++;this.items.set(id,{buffer,kind,size,padded,format});this.bytes+=padded;return id;
 }
 get(id){const item=this.items.get(id);if(!item)throw RangeError('invalid or released geometry handle');return item;}
 upload(id,offset,memory,pointer,length,draws=null){
  const b=this.get(id);
  if(!(memory instanceof SharedArrayBuffer)||![offset,pointer,length].every(Number.isInteger)||offset<0||offset%4||pointer<0x1000||length<=0||length%4||offset+length>b.padded||pointer+length>memory.byteLength)throw RangeError('invalid geometry upload range');
  const data=new Uint8Array(memory,pointer,length);
  if(draws){draws.uploadBuffer(b,offset,data);return;}
  this.device.queue.writeBuffer(b.buffer,offset,data);
 }
 destroy(id){const b=this.get(id);b.buffer.destroy();this.items.delete(id);this.bytes-=b.padded;}
 dispose(){for(const id of this.items.keys())this.destroy(id);}
}
