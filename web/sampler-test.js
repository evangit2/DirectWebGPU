import {defaultSampler,SamplerCache} from './d3d9-samplers.js';
export async function testSamplers(device){
 const cache=new SamplerCache(device),texture=device.createTexture({size:[2,2],mipLevelCount:2,format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
 const output=device.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),read=device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 device.pushErrorScope('validation');
 try{
  device.queue.writeTexture({texture},new Uint8Array([255,0,0,255,0,0,255,255,255,0,0,255,0,0,255,255]),{bytesPerRow:8},[2,2]);device.queue.writeTexture({texture,mipLevel:1},new Uint8Array([0,255,0,255]),{},[1,1]);
  const code=`@group(0) @binding(0) var t:texture_2d<f32>; @group(0) @binding(1) var s:sampler; @group(0) @binding(2) var<storage,read_write> result:vec4<f32>; override u:f32=1.25; override lod:f32=0.0; @compute @workgroup_size(1) fn main(){result=textureSampleLevel(t,s,vec2<f32>(u,0.5),lod);}`;
  const module=device.createShaderModule({code});
  const samples=[];
  async function check(name,state,u,lod,expected){
   const sampler=cache.get(state,2);if(cache.get(state.slice(),2)!==sampler)throw Error('sampler cache missed identical descriptor');
   const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main',constants:{u,lod}}});
   const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:texture.createView()},{binding:1,resource:sampler},{binding:2,resource:{buffer:output}}]});
   const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();encoder.copyBufferToBuffer(output,0,read,0,16);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const value=Array.from(new Float32Array(read.getMappedRange()).slice());read.unmap();if(value.some((v,i)=>Math.abs(v-expected[i])>0.01))throw Error(name+' mismatch '+value);samples.push({name,rgba:value});
  }
  let state=defaultSampler();await check('repeat',state,1.25,0,[1,0,0,1]);state[1]=3;await check('clamp',state,1.25,0,[0,0,1,1]);state[1]=2;await check('mirror',state,1.25,0,[0,0,1,1]);
  state=defaultSampler();state[5]=state[6]=2;await check('bilinear',state,.5,0,[.5,0,.5,1]);
  state=defaultSampler();await check('mip filtering disabled',state,.25,1,[1,0,0,1]);state[7]=1;await check('nearest mip',state,.25,1,[0,1,0,1]);state[7]=2;await check('linear mip',state,.25,.5,[.5,.5,0,1]);state[7]=1;state[9]=1;await check('largest mip restriction',state,.25,0,[0,1,0,1]);
  state[1]=4;let rejected=false;try{cache.get(state,2)}catch(e){rejected=e instanceof RangeError}if(!rejected)throw Error('border addressing silently approximated');
  return {result:'passed',samples,cacheEntries:cache.items.size,HumusFrames:0};
 }finally{cache.dispose();texture.destroy();output.destroy();read.destroy();const error=await device.popErrorScope();if(error)throw Error(error.message)}
}
