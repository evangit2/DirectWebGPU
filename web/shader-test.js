import {vertexLayout} from './vertex-layout.js';
import {testShaderConstants} from './constant-test.js';
import {GeometryBuffers} from './gpu-buffers.js';
import {testGeometryBuffers} from './buffer-test.js';
import {testDeviceBridge} from './device-test.js';
import {testStencil} from './stencil-test.js';
import {createShaderTranslator} from './shaders.js';
const status=document.getElementById('status');
document.getElementById('run').onclick=async()=>{
 const report={kind:'shader diagnostic, not Humus acceptance',runId:crypto.randomUUID(),startedAt:new Date().toISOString(),checks:[],sceneFrames:0};
 let device;
 try{
  status.textContent='Translating diagnostic shaders…';
  report.shaderBuild=await(await fetch('/generated/shader-build.json')).json();
  report.build=await(await fetch('/api/build')).json();
  const tr=await createShaderTranslator();
  const [vs,ps]=await Promise.all(['vertexExplicit','pixel'].map(async name=>new Uint8Array(await(await fetch('/generated/'+name+'.bin')).arrayBuffer())));
  const shaders=tr.translatePair(vs,ps);report.inputDeclaration={kind:'explicit VS1.1 POSITION v0 / COLOR v1',expectedInputLocations:[0,1],HumusFrames:0};report.shaders=shaders;report.checks.push('VS1.1 and PS2.0 bytecode translated and WGSL validated by Naga');
  try{tr.translatePair(vs.slice(0,7),ps);throw Error('malformed bytecode accepted');}catch(e){if(!String(e).includes('invalid DX9 bytecode length'))throw e;report.checks.push('misaligned/truncated bytecode rejected');}
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('no GPU adapter');
  report.adapter={vendor:adapter.info.vendor,architecture:adapter.info.architecture,isFallbackAdapter:adapter.info.isFallbackAdapter};
  device=await adapter.requestDevice();report.geometryBuffers=await testGeometryBuffers(device);const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  device.pushErrorScope('validation');
  const modules=[shaders.vertex,shaders.pixel].map(s=>device.createShaderModule({code:s.wgsl}));
  for(const mod of modules){const info=await mod.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw Error(JSON.stringify(info.messages));}
  // Declaration order intentionally differs from shader input order.
  const declaration=new Uint8Array([0,0,16,0,3,0,10,0, 0,0,0,0,3,0,0,0, 255,0,0,0,17,0,0,0]);
  const layout=vertexLayout(declaration,shaders.vertex.inputs,[{stride:32}]);report.vertexLayout=layout;
  const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:modules[0],entryPoint:'main',buffers:layout.map(({stream,...descriptor})=>descriptor)},fragment:{module:modules[1],entryPoint:'main',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}});
  const vertices=new Float32Array([-0.8,-0.8,0.5,1,1,0,0,1, 0.8,-0.8,0.5,1,0,1,0,1, 0,0.8,0.5,1,0,0,1,1]);
  const geometry=new GeometryBuffers(device),guest=new SharedArrayBuffer(8192);
  new Float32Array(guest,4096,vertices.length).set(vertices);
  const vertexId=await geometry.create(6,vertices.byteLength,100);await geometry.upload(vertexId,0,guest,4096,vertices.byteLength);
  new Uint16Array(guest,4096,4).set([0,1,2,0]);
  const indexId=await geometry.create(7,6,101);await geometry.upload(indexId,0,guest,4096,8);
  const vb=geometry.get(vertexId).buffer,ib=geometry.get(indexId).buffer;
  const target=device.createTexture({size:[128,128],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  const read=device.createBuffer({size:128*512,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const encoder=device.createCommandEncoder();const pass=encoder.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});
  pass.setPipeline(pipeline);pass.setVertexBuffer(0,vb);pass.setIndexBuffer(ib,'uint16');pass.drawIndexed(3);pass.end();
  encoder.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:512},[128,128]);device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();
  await read.mapAsync(GPUMapMode.READ);const pixels=new Uint8ClampedArray(read.getMappedRange().slice(0));read.unmap();
  // A single test readback checks shader output; it is not the runtime presentation path.
  const center=Array.from(pixels.slice((64*128+64)*4,(64*128+64)*4+4));report.centerRGBA=center;
  if(center[0]<40||center[1]<40||center[2]<90||center[3]!==255)throw Error('unexpected interpolated center color: '+center);
  document.getElementById('canvas').getContext('2d').putImageData(new ImageData(pixels,128,128),0,0);
  const textureBytes=new Uint8Array(await(await fetch('/generated/texture.bin')).arrayBuffer());
  const textured=tr.translatePair(vs,textureBytes);report.textureShader=textured.pixel;
  const textureModule=device.createShaderModule({code:textured.pixel.wgsl});
  const texturePipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:modules[0],entryPoint:'main',buffers:layout.map(({stream,...descriptor})=>descriptor)},fragment:{module:textureModule,entryPoint:'main',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}});
  const tex=device.createTexture({size:[1,1],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
  device.queue.writeTexture({texture:tex},new Uint8Array([17,121,233,255]),{bytesPerRow:4},[1,1]);
  const group=device.createBindGroup({layout:texturePipeline.getBindGroupLayout(2),entries:[{binding:0,resource:tex.createView()},{binding:1,resource:device.createSampler()}]});
  const enc2=device.createCommandEncoder();const pass2=enc2.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});
  pass2.setPipeline(texturePipeline);pass2.setVertexBuffer(0,vb);
  for(let i=0;i<2;i++)pass2.setBindGroup(i,device.createBindGroup({layout:texturePipeline.getBindGroupLayout(i),entries:[]}));
  pass2.setBindGroup(2,group);pass2.draw(3);pass2.end();enc2.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:512},[128,128]);device.queue.submit([enc2.finish()]);
  await read.mapAsync(GPUMapMode.READ);const sampled=new Uint8Array(read.getMappedRange().slice((64*128+64)*4,(64*128+64)*4+4));read.unmap();
  report.textureRGBA=Array.from(sampled);if(report.textureRGBA.join(',')!=='17,121,233,255')throw Error('texture sampling output mismatch: '+report.textureRGBA);
  report.checks.push('PS2.0 texld combined sampler split; GPU texture sample matched exact RGBA');tex.destroy();
  report.shaderConstants=await testShaderConstants(device,tr,ps,vb);
  report.alphaStencil=await testStencil(device,tr,shaders);
  const scoped=await device.popErrorScope();if(scoped||errors.length)throw Error(scoped?.message??errors.join('\n'));
  report.indexedGeometry={result:'passed',indexCount:3,indexFormat:'uint16',source:'GeometryBuffers shared-memory uploads',HumusFrames:0};
  report.checks.push('indexed draw consumed persistent vertex/index buffers','browser WGSL compilation and pipeline validation passed','GPU draw completed; sampled interpolated color matched');
  report.deviceBridge=await testDeviceBridge();
  report.diagnosticDraws=2+report.alphaStencil.draws+report.shaderConstants.draws;report.result='passed';geometry.dispose();target.destroy();read.destroy();
 }catch(e){report.result='failed';report.error=String(e.stack??e);}
 finally{device?.destroy();status.textContent=JSON.stringify(report,null,2);const session=await(await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();await fetch('/api/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:session.token,report})});}
};
