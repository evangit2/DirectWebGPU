import {GeometryBuffers} from './gpu-buffers.js';
export async function testGeometryBuffers(device){
 const storage=new GeometryBuffers(device),memory=new SharedArrayBuffer(8192),bytes=new Uint8Array(memory);
 const assert=(v,m)=>{if(!v)throw Error(m)};
 const rejects=async(fn)=>{try{await fn()}catch(e){if(e instanceof RangeError)return;throw e}throw Error('invalid geometry operation accepted')};
 async function read(id){const b=storage.get(id),staging=device.createBuffer({size:b.padded,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{const enc=device.createCommandEncoder();enc.copyBufferToBuffer(b.buffer,0,staging,0,b.padded);device.queue.submit([enc.finish()]);await staging.mapAsync(GPUMapMode.READ);return Array.from(new Uint8Array(staging.getMappedRange()).slice())}finally{staging.destroy()}}
 try{
  const vb=await storage.create(6,14,100),ib=await storage.create(7,6,101);
  bytes.set([1,2,3,4,5,6,7,8,9,10,11,12,13,14,0,0],4096);
  await storage.upload(vb,0,memory,4096,16);
  bytes.set([5,60,70,8],4100);await storage.upload(vb,4,memory,4100,4);
  const vertexBytes=await read(vb);assert(vertexBytes.join(',')==='1,2,3,4,5,60,70,8,9,10,11,12,13,14,0,0','partial vertex upload corrupted adjacent bytes');
  bytes.set([0,0,1,0,2,0,0,0],4096);await storage.upload(ib,0,memory,4096,8);
  const indexBytes=await read(ib);assert(indexBytes.join(',')==='0,0,1,0,2,0,0,0','16-bit index upload lost final halfword');
  await rejects(()=>storage.upload(vb,2,memory,4096,4));await rejects(()=>storage.upload(vb,12,memory,4096,8));await rejects(()=>storage.upload(vb,0,memory,8190,4));await rejects(()=>storage.create(7,3,101));
  storage.destroy(vb);await rejects(()=>storage.upload(vb,0,memory,4096,4));assert(storage.bytes===8,'destroy did not release budget');storage.dispose();assert(storage.bytes===0&&storage.items.size===0,'dispose leaked geometry');
  return {result:'passed',vertexBytes,indexBytes,checks:['GPU readback matches partial vertex updates','16-bit index tail preserved with alignment padding','misalignment, pointer overflow, size overflow and stale handles rejected','resource destruction releases allocation budget'],HumusFrames:0};
 }finally{storage.dispose()}
}
