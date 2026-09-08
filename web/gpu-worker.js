// Owns WebGPU resources and the canvas. CPU execution runs in another worker.
import {D3D9RenderState,RS} from './d3d9-state.js';
let device,canvas,context,windowSize,backend,nextId=1,port,pending=0;
const emit=(type,data={})=>postMessage({type,...data});
const INVALID=0x8876086c,UNAVAILABLE=0x8876086a;
async function init(data){
 canvas=data.canvas;port=data.port;
 const result={secureContext:isSecureContext,crossOriginIsolated,sharedArrayBuffer:typeof SharedArrayBuffer!=='undefined',webgpu:!!navigator.gpu,userAgent:navigator.userAgent};
 const adapter=await navigator.gpu?.requestAdapter();if(!adapter)throw Error('no WebGPU adapter');
 const i=adapter.info;result.adapter=Object.fromEntries(['vendor','architecture','device','description','isFallbackAdapter'].map(k=>[k,i[k]??null]));result.features=[...adapter.features];
 device=await adapter.requestDevice();device.addEventListener('uncapturederror',e=>emit('gpu-error',{message:e.error.message}));device.lost.then(i=>emit('gpu-lost',{reason:i.reason,message:i.message}));
 result.deviceCreated=true;result.hardwareAcceleration='GPU device available; no Humus scene verified';
 let chain=Promise.resolve();port.onmessage=({data})=>{if(++pending>64){emit('gpu-error',{message:'GPU command queue limit exceeded'});return}chain=chain.then(()=>dispatch(data)).catch(e=>emit('gpu-error',{message:String(e)})).finally(()=>pending--)};
 port.start();port.postMessage({ready:true,result});emit('probe',{result});
}
function reply(buffer,address,result){if(!(buffer instanceof SharedArrayBuffer)||!Number.isInteger(address)||address<4||address%4||address+4>buffer.byteLength)throw Error('invalid GPU reply pointer');const words=new Int32Array(buffer);Atomics.store(words,address/4,result|0);Atomics.notify(words,address/4,1);}
async function dispatch({func,args,buffer,retAddr}){
 let result=INVALID;
 try{
  if(!Array.isArray(args)||args.length>64)throw Error('invalid GPU command args');
  if(func==='create_window'){
   const [title,width,height]=args;if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)throw Error('invalid window size');
   canvas.width=width;canvas.height=height;windowSize=[width,height];emit('window-created',{title,width,height});result=1;
  }else if(func==='graphics_call'){
   const [op,...values]=args;if(values.some(v=>!Number.isInteger(v)||v<0||v>0xffffffff))throw Error('invalid graphics argument');
   result=await graphics(op,values);
  }else throw Error('unsupported GPU host operation '+func);
 }catch(e){emit('gpu-error',{message:String(e.stack??e)});}
 finally{reply(buffer,retAddr,result)}
}
async function graphics(op,a){
 if(op===1){
  if(backend)throw Error('second D3D9 device unsupported');
  const [width,height,format,count,multi,quality,swap,hwnd,windowed,autoDepth,depthFormat,flags,refresh,interval]=a;
  if(a.length!==14||!windowSize||width!==windowSize[0]||height!==windowSize[1]||![21,22].includes(format)||count!==1||multi!==0||quality!==0||swap!==1||hwnd>1||windowed!==1||autoDepth!==1||depthFormat!==75||flags!==0||refresh!==0||![0,1,0x80000000].includes(interval))return UNAVAILABLE;
  device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');
  context=canvas.getContext('webgpu');if(!context)throw Error('WebGPU canvas context unavailable');
  context.configure({device,format:'bgra8unorm',alphaMode:'opaque',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST});
  const color=device.createTexture({label:'D3D9 backbuffer',size:[width,height],format:'bgra8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  const depth=device.createTexture({label:'D3D9 D24S8',size:[width,height],format:'depth24plus-stencil8',usage:GPUTextureUsage.RENDER_ATTACHMENT});
  const oom=await device.popErrorScope(),validation=await device.popErrorScope();if(oom||validation){color.destroy();depth.destroy();throw Error((oom??validation).message)}
  backend={id:nextId++,color,depth,width,height,state:new D3D9RenderState(),presents:0,submissions:0};
  emit('d3d9-device-created',{backendId:backend.id,width,height,colorFormat:'bgra8unorm',depthFormat:'depth24plus-stencil8',validation:'passed',sceneFrames:0});return backend.id;
 }
 if(!backend||a[0]!==backend.id)return INVALID;
 if(op===2){backend.color.destroy();backend.depth.destroy();context.unconfigure();backend=null;return 1}
 if(op===3){ // Clear full attachment; rectangle clears remain unsupported.
  const [,flags,argb,zBits,stencil]=a;if(a.length!==5||!flags||(flags&~7))return INVALID;
  const z=new Float32Array(new Uint32Array([zBits]).buffer)[0];if(!Number.isFinite(z)||z<0||z>1)return INVALID;
  const colorValue={r:((argb>>>16)&255)/255,g:((argb>>>8)&255)/255,b:(argb&255)/255,a:(argb>>>24)/255};
  device.pushErrorScope('validation');const enc=device.createCommandEncoder();
  const pass=enc.beginRenderPass({colorAttachments:[{view:backend.color.createView(),loadOp:flags&1?'clear':'load',storeOp:'store',clearValue:colorValue}],depthStencilAttachment:{view:backend.depth.createView(),depthLoadOp:flags&2?'clear':'load',depthStoreOp:'store',depthClearValue:z,stencilLoadOp:flags&4?'clear':'load',stencilStoreOp:'store',stencilClearValue:stencil&255}});pass.end();device.queue.submit([enc.finish()]);
  const err=await device.popErrorScope();if(err)throw Error(err.message);emit('gpu-submission',{kind:'clear',count:++backend.submissions,sceneFrames:0});return 1;
 }
 if(op===4){ // GPU-to-GPU presentation, with no framebuffer readback.
  device.pushErrorScope('validation');const enc=device.createCommandEncoder();enc.copyTextureToTexture({texture:backend.color},{texture:context.getCurrentTexture()},[backend.width,backend.height]);device.queue.submit([enc.finish()]);
  const err=await device.popErrorScope();if(err)throw Error(err.message);backend.presents++;backend.submissions++;emit('application-present',{count:backend.presents,submittedFrames:backend.presents,sceneFrames:0});return 1;
 }
 throw Error('unsupported graphics opcode '+op);
}
self.onmessage=({data})=>{if(data.type==='init')init(data).catch(e=>{port?.postMessage({ready:false,error:String(e)});emit('gpu-error',{message:String(e)})})};
