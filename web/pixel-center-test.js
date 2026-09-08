import {DrawRenderer} from './d3d9-draw.js';
import {GeometryBuffers} from './gpu-buffers.js';
import {ShaderObjects} from './shader-objects.js';
import {createShaderTranslator} from './shaders.js';
import {D3D9RenderState,RS} from './d3d9-state.js';
import {defaultSampler} from './d3d9-samplers.js';
document.getElementById('run').onclick=async()=>{
 const status=document.getElementById('status'),report={runId:crypto.randomUUID(),kind:'independent D3D9 pixel-center coverage diagnostic; not Humus acceptance',startedAt:new Date().toISOString()};let device,renderer,buffers,color,depth,read;
 try{
  report.build=await(await fetch('/api/build')).json();const adapter=await navigator.gpu.requestAdapter();device=await adapter.requestDevice();report.adapter={vendor:adapter.info.vendor,architecture:adapter.info.architecture,isFallbackAdapter:adapter.info.isFallbackAdapter};
  const shaders=new ShaderObjects(await createShaderTranslator());buffers=new GeometryBuffers(device);color=device.createTexture({size:[4,4],format:'bgra8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});depth=device.createTexture({size:[4,4],format:'depth24plus-stencil8',usage:GPUTextureUsage.RENDER_ATTACHMENT});renderer=new DrawRenderer(device,{color,depth,buffers,shaders});
  // Rectangle from screen (.25,.25) to (1.25,1.25); only integer center (1,1)
  // lies inside it. All edges avoid sample centers and the diagonal is internal.
  const positions=[[.25,.25],[1.25,.25],[1.25,1.25],[.25,.25],[1.25,1.25],[.25,1.25]];
  const vertices=new Float32Array(positions.flatMap(([x,y])=>[x/2-1,1-y/2,.5,1,0,0,1]));const memory=new SharedArrayBuffer(8192);new Uint8Array(memory,4096,vertices.byteLength).set(new Uint8Array(vertices.buffer));const vb=await buffers.create(6,vertices.byteLength,100);await buffers.upload(vb,0,memory,4096,vertices.byteLength);
  const state=new D3D9RenderState();state.set(RS.ZENABLE,0);state.set(RS.ZWRITEENABLE,0);state.set(RS.CULLMODE,1);
  const transforms=new Float32Array(1024);for(let m=0;m<3;m++)for(let i=0;i<4;i++)transforms[m*16+i*5]=1;
  const packet={fixed:new Uint32Array(transforms.buffer,0,48),vertex:0,pixel:0,kind:4,count:6,first:0,index:0,base:0,max:5,state,declaration:new Uint8Array([0,0,0,0,2,0,0,0,0,0,12,0,3,0,10,0,255,0,0,0,17,0,0,0]),streams:Array.from({length:16},(_,i)=>({id:i?0:vb,offset:0,stride:i?0:28})),registers:[[new Uint32Array(transforms.buffer),new Uint32Array(64),new Uint32Array(16)],[new Uint32Array(128),new Uint32Array(64),new Uint32Array(16)]],textures:new Uint32Array(16),samplers:Array.from({length:16},defaultSampler),viewport:new Uint32Array([0,0,4,4,0,0x3f800000])};
  device.pushErrorScope('validation');await renderer.draw(packet);const err=await device.popErrorScope();if(err)throw Error(err.message);
  read=device.createBuffer({size:1024,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const e=device.createCommandEncoder();e.copyTextureToBuffer({texture:color},{buffer:read,bytesPerRow:256},[4,4]);device.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const bytes=new Uint8Array(read.getMappedRange());const actual=[];for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(bytes[y*256+x*4+2]>128)actual.push([x,y]);read.unmap();
  report.expectedD3D9CoveredPixels=[[1,1]];report.actualCoveredPixels=actual;report.status=JSON.stringify(actual)==='[[1,1]]'?'passed':'failed: pixel-center mismatch';report.oracle='Integer pixel centers: .25 < x,y < 1.25 includes only (1,1); independent of shader translation.';
 }catch(e){report.status='error';report.error=String(e.stack??e);}finally{renderer?.dispose();buffers?.dispose();color?.destroy();depth?.destroy();read?.destroy();device?.destroy();}
 status.textContent=JSON.stringify(report,null,2);const {token}=await(await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();await fetch('/api/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,report})});
};
