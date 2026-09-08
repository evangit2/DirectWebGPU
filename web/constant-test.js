import {packShaderUniforms} from './shader-uniforms.js';
export async function testShaderConstants(device,translator,pixel,vb){
 const vertex=new Uint8Array(await(await fetch('/generated/vertexConstant.bin')).arrayBuffer());
 const pair=translator.translatePair(vertex,pixel);
 const registers=[new Uint32Array(1024),new Uint32Array(64),new Uint32Array(16)];
 new Float32Array(registers[0].buffer).set([0.25,0.5,0.75,1],7*4);
 const words=packShaderUniforms(pair.vertex,registers);
 if(words.length!==4||pair.vertex.uniforms[0]?.index!==7)throw Error('sparse c7 reflection mismatch');
 const uniform=device.createBuffer({size:words.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(uniform,0,words);
 const target=device.createTexture({size:[32,32],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 const read=device.createBuffer({size:32*256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 let scopeOpen=true;device.pushErrorScope('validation');
 try{
  const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:device.createShaderModule({code:pair.vertex.wgsl}),entryPoint:'main',buffers:[{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:'float32x4'}]}]},fragment:{module:device.createShaderModule({code:pair.pixel.wgsl}),entryPoint:'main',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}});
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(pair.vertex.uniformGroup),entries:[{binding:0,resource:{buffer:uniform}}]});
  const enc=device.createCommandEncoder(),pass=enc.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[]}));pass.setBindGroup(pair.vertex.uniformGroup,group);pass.setVertexBuffer(0,vb);pass.draw(3);pass.end();enc.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:256},[32,32]);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);
  const center=Array.from(new Uint8Array(read.getMappedRange(),16*256+16*4,4));read.unmap();
  const validation=await device.popErrorScope();scopeOpen=false;if(validation)throw Error(validation.message);
  if(center.join(',')!=='64,128,191,255')throw Error('shader c7 uniform mismatch: '+center);
  return {result:'passed',centerRGBA:center,uniforms:pair.vertex.uniforms,packedBytes:words.byteLength,draws:1,HumusFrames:0};
 }finally{if(scopeOpen)await device.popErrorScope();uniform.destroy();target.destroy();read.destroy()}
}
