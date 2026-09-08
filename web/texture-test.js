import {TextureStorage} from './gpu-textures.js';
export async function testTextures(device){
 const storage=new TextureStorage(device),memory=new SharedArrayBuffer(16384),bytes=new Uint8Array(memory);
 const assert=(v,m)=>{if(!v)throw Error(m)};
 const rejects=async fn=>{try{await fn()}catch(e){if(e instanceof RangeError)return;throw e}throw Error('invalid texture operation accepted')};
 async function read(id,level){const t=storage.get(id),m=t.mips[level],staging=device.createBuffer({size:256*m.rows,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{const enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture:t.texture,mipLevel:level},{buffer:staging,bytesPerRow:256,rowsPerImage:m.rows},[m.physicalWidth,m.physicalHeight]);device.queue.submit([enc.finish()]);await staging.mapAsync(GPUMapMode.READ);const result=[],view=new Uint8Array(staging.getMappedRange());for(let row=0;row<m.rows;row++)result.push(...view.slice(row*256,row*256+m.rowBytes*(t.format===50?4:1)));return result}finally{staging.destroy()}}
 try{
  const rgba=await storage.create(2,2,0,21),opaque=await storage.create(2,2,1,22);
  bytes.set([3,2,1,4,7,6,5,8,99,99,99,99,11,10,9,12,15,14,13,16],4096);
  await storage.upload(rgba,0,memory,4096,12,20);await storage.upload(opaque,0,memory,4096,12,20);
  assert((await read(rgba,0)).join(',')==='3,2,1,4,7,6,5,8,11,10,9,12,15,14,13,16','pitched BGRA upload mismatch');
  assert((await read(opaque,0)).join(',')==='3,2,1,255,7,6,5,255,11,10,9,255,15,14,13,255','XRGB alpha mismatch');assert(bytes[4099]===4,'XRGB conversion mutated guest');
  const lum=await storage.create(2,2,0,50);bytes.set([0,64,99,128,255],4096);await storage.upload(lum,0,memory,4096,3,5);
  assert((await read(lum,0)).join(',')==='0,0,0,255,64,64,64,255,128,128,128,255,255,255,255,255','L8 luminance replication mismatch');assert(bytes[4098]===99,'L8 upload mutated guest');assert(storage.get(lum).bytes===20,'L8 expanded GPU accounting');
  bytes[4096]=23;await storage.upload(lum,1,memory,4096,1,1);assert((await read(lum,1)).join(',')==='23,23,23,255','L8 tail mip');
  const compressed=[];
  if(device.features.has('texture-compression-bc'))for(const format of [0x31545844,0x33545844,0x35545844]){
   const id=await storage.create(8,8,0,format),t=storage.get(id);
   for(let level=0;level<t.levels;level++){const m=t.mips[level],length=m.rows*m.rowBytes;for(let i=0;i<length;i++)bytes[4096+i]=(i+level*17)&255;const expected=Array.from(bytes.slice(4096,4096+length));await storage.upload(id,level,memory,4096,m.rowBytes,length);assert((await read(id,level)).join(',')===expected.join(','),'compressed mip upload mismatch');}
   compressed.push({format,levels:t.levels,smallestMip:[1,1]});
  }
  await rejects(()=>storage.upload(rgba,2,memory,4096,8,16));await rejects(()=>storage.upload(rgba,0,memory,4096,4,16));await rejects(()=>storage.upload(rgba,0,memory,16380,8,16));await rejects(()=>storage.upload(rgba,0,memory,4096,12,19));await rejects(()=>storage.create(3,4,1,0x31545844));
  storage.destroy(rgba);await rejects(()=>storage.upload(rgba,0,memory,4096,8,16));storage.dispose();assert(storage.bytes===0,'texture budget leaked');
  return {result:'passed',compressed,checks:['L8 luminance replication, opaque alpha, pitch and tail mip verified','GPU readback verifies pitched BGRA rows','XRGB samples opaque without modifying guest','compressed mip payloads including 2x2 and 1x1 copied exactly','invalid ranges and stale handles rejected','resource budget released'],HumusFrames:0};
 }finally{storage.dispose()}
}
