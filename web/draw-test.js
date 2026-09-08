import {DrawRenderer,decodeDraw} from './d3d9-draw.js';
import {ShaderObjects} from './shader-objects.js';
import {GeometryBuffers} from './gpu-buffers.js';
import {D3D9RenderState,RS} from './d3d9-state.js';
export function diagnosticDrawPacket(vertex,pixel,vb,index=0){
 const state=new D3D9RenderState();state.set(RS.CULLMODE,1);state.set(RS.ZENABLE,0);
 const declaration=new Uint8Array([0,0,0,0,3,0,0,0,0,0,16,0,3,0,10,0,255,0,0,0,17,0,0,0]);
 const words=[0x39445244,vertex,pixel,4,3,0,index,0,2,declaration.length,20];for(let i=0;i<16;i++)words.push(i===0?vb:0,0,i===0?32:0);for(const [k,v]of Object.entries(state.values))words.push(Number(k),v);words.push(...new Uint32Array(declaration.buffer),...new Uint32Array(1312));return new Uint8Array(new Uint32Array(words).buffer);
}
export async function testDrawPackets(device,translator,vs,ps){
 const objects=new ShaderObjects(translator),buffers=new GeometryBuffers(device),color=device.createTexture({size:[32,32],format:'bgra8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),depth=device.createTexture({size:[32,32],format:'depth24plus-stencil8',usage:GPUTextureUsage.RENDER_ATTACHMENT}),read=device.createBuffer({size:8192,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const renderer=new DrawRenderer(device,{shaders:objects,buffers,color,depth}),memory=new SharedArrayBuffer(32768),samples=[];device.pushErrorScope('validation');
 try{
  const vertex=objects.create(0,vs),pixel=objects.create(1,ps),values=new Float32Array([-.8,-.8,.5,1,.25,.5,.75,1,.8,-.8,.5,1,.25,.5,.75,1,0,.8,.5,1,.25,.5,.75,1]);new Uint8Array(memory,4096,values.byteLength).set(new Uint8Array(values.buffer));const vb=await buffers.create(6,values.byteLength,100);await buffers.upload(vb,0,memory,4096,values.byteLength);
  new Uint16Array(memory,4096,4).set([0,1,2,0]);const ib=await buffers.create(7,6,101);await buffers.upload(ib,0,memory,4096,8);
  for(const index of [0,ib]){const payload=diagnosticDrawPacket(vertex,pixel,vb,index);new Uint8Array(memory,4096,payload.length).set(payload);await renderer.draw(decodeDraw(memory,4096,payload.length));const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture:color},{buffer:read,bytesPerRow:256},[32,32]);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const bytes=Array.from(new Uint8Array(read.getMappedRange(),16*256+16*4,4));read.unmap();if(bytes.join(',')!=='191,128,64,255')throw Error('draw packet output mismatch '+bytes);samples.push({indexed:!!index,rgba:[bytes[2],bytes[1],bytes[0],bytes[3]]});}
  const payload=diagnosticDrawPacket(vertex,pixel,vb);new Uint8Array(memory,4096,payload.length).set(payload);const packet=decodeDraw(memory,4096,payload.length);packet.max=100;let rejected=false;try{await renderer.draw(packet)}catch(e){rejected=e instanceof RangeError}if(!rejected)throw Error('out-of-bounds draw accepted');
  rejected=false;try{decodeDraw(memory,4096,payload.length-4)}catch{rejected=true}if(!rejected)throw Error('truncated draw packet accepted');
  return{result:'passed',samples,draws:2,checks:['decoded draw packets reach GPU rendering','indexed and nonindexed output matched','buffer overflow and truncated packets rejected'],HumusFrames:0};
 }finally{renderer.dispose();objects.dispose();buffers.dispose();color.destroy();depth.destroy();read.destroy();const error=await device.popErrorScope();if(error)throw Error(error.message)}
}
