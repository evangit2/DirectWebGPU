import {D3D9RenderState,RS} from './d3d9-state.js';
// Diagnostic geometry only. The production module above consumes API state.
export async function testStencil(device,translator,shaders){
 const size=64;
 const color=device.createTexture({size:[size,size],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 const depth=device.createTexture({size:[size,size],format:'depth24plus-stencil8',usage:GPUTextureUsage.RENDER_ATTACHMENT});
 const read=device.createBuffer({size:256*size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 const buffers=[];const state=new D3D9RenderState();
 state.set(RS.CULLMODE,1);
 const vertex=device.createShaderModule({code:shaders.vertex.wgsl});
 async function pipeline(){
  const fragment=device.createShaderModule({code:state.alphaVariant(shaders.pixel.wgsl,translator)});
  return device.createRenderPipelineAsync({layout:'auto',vertex:{module:vertex,entryPoint:'main',buffers:[{arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:'float32x4'},{shaderLocation:1,offset:16,format:'float32x4'}]}]},fragment:{module:fragment,entryPoint:'main',targets:[state.colorTarget('rgba8unorm')]},depthStencil:state.depthStencil(),primitive:state.primitive()});
 }
 function geometry(regions,z){
  const data=[];for(const [left,right,rgba] of regions){for(const [x,y]of[[left,-1],[right,-1],[left,1],[left,1],[right,-1],[right,1]])data.push(x,y,z,1,...rgba)}
  const buffer=device.createBuffer({size:data.length*4,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(buffer,0,new Float32Array(data));buffers.push(buffer);return{buffer,count:data.length/8};
 }
 let draws=0;
 try{
  state.set(RS.COLORWRITEENABLE,0);state.set(RS.ZFUNC,2);state.set(RS.ALPHATESTENABLE,1);state.set(RS.ALPHAFUNC,2);state.set(RS.ALPHAREF,255);state.set(RS.STENCILENABLE,1);state.set(RS.STENCILFUNC,8);state.set(RS.STENCILPASS,3);state.set(RS.STENCILREF,1);
  const maskPipeline=await pipeline();const mask=geometry([[-1,0,[0,0,0,0.5]],[0,1,[0,0,0,1]]],0.5);
  state.set(RS.ALPHATESTENABLE,0);state.set(RS.ZENABLE,0);state.set(RS.ZWRITEENABLE,0);state.set(RS.COLORWRITEENABLE,15);state.set(RS.STENCILFUNC,3);state.set(RS.STENCILPASS,1);state.set(RS.ALPHABLENDENABLE,1);state.set(RS.SRCBLEND,2);state.set(RS.DESTBLEND,2);
  const lightPipeline=await pipeline();const light=geometry([[-1,1,[0.25,0,0,0]]],0.75);
  const encoder=device.createCommandEncoder();
  const attachment={view:depth.createView(),depthLoadOp:'clear',depthStoreOp:'store',depthClearValue:1,stencilLoadOp:'clear',stencilStoreOp:'store',stencilClearValue:0};
  let pass=encoder.beginRenderPass({colorAttachments:[{view:color.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0.1,a:1}}],depthStencilAttachment:attachment});
  pass.setPipeline(maskPipeline);pass.setStencilReference(1);pass.setVertexBuffer(0,mask.buffer);pass.draw(mask.count);draws++;
  pass.setPipeline(lightPipeline);state.applyDynamic(pass);pass.setVertexBuffer(0,light.buffer);pass.draw(light.count);draws++;pass.end();
  encoder.copyTextureToBuffer({texture:color},{buffer:read,bytesPerRow:256},[size,size]);device.queue.submit([encoder.finish()]);
  async function samples(){await read.mapAsync(GPUMapMode.READ);const bytes=new Uint8Array(read.getMappedRange());const result=[16,48].map(x=>Array.from(bytes.slice((32*size+x)*4,(32*size+x)*4+4)));read.unmap();return result;}
  const stencilSamples=await samples();
  const near=(a,b)=>Math.abs(a-b)<=1;
  if(!near(stencilSamples[0][0],64)||!near(stencilSamples[0][2],26)||stencilSamples[1][0]!==0||!near(stencilSamples[1][2],26))throw Error('discard/stencil or additive blend mismatch: '+JSON.stringify(stencilSamples));
  // Probe depth independently: rejected right-half fragments must not have
  // written .5. A .75 fragment therefore passes only on that half.
  state.set(RS.STENCILENABLE,0);state.set(RS.ALPHABLENDENABLE,0);state.set(RS.ZENABLE,1);state.set(RS.ZFUNC,2);
  const probePipeline=await pipeline();const probe=geometry([[-1,1,[0,1,0,1]]],0.75);
  const second=device.createCommandEncoder();pass=second.beginRenderPass({colorAttachments:[{view:color.createView(),loadOp:'load',storeOp:'store'}],depthStencilAttachment:{...attachment,depthLoadOp:'load',stencilLoadOp:'load'}});
  pass.setPipeline(probePipeline);pass.setVertexBuffer(0,probe.buffer);pass.draw(probe.count);draws++;pass.end();second.copyTextureToBuffer({texture:color},{buffer:read,bytesPerRow:256},[size,size]);device.queue.submit([second.finish()]);
  const depthSamples=await samples();if(!near(depthSamples[0][0],64)||depthSamples[0][1]!==0||depthSamples[1][0]!==0||depthSamples[1][1]!==255)throw Error('discard incorrectly changed depth: '+JSON.stringify(depthSamples));
  return{result:'passed',draws,stencilSamples,depthSamples,checks:['alpha LESS255 passes .5 and rejects 1','discarded fragments leave stencil unchanged','stencil equality gates additive lighting','discarded fragments leave depth unchanged']};
 }finally{for(const b of buffers)b.destroy();color.destroy();depth.destroy();read.destroy();}
}
