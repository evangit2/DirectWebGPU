import {resourceMetrics} from './resource-metrics.js';
import {GpuTiming} from './gpu-timing.js';
import {SceneEquivalence} from './scene-equivalence.js';
import {executeDrawBatch} from './draw-batch.js';
import {PresentationMetrics} from './performance-metrics.js';
import {captureFrame} from './frame-capture.js';
import {captureDraw} from './draw-diagnostic.js';
import {deviceCaps,supportsFormat} from './d3d9-caps.js';
import {DrawRenderer,decodeDraw} from './d3d9-draw.js';
import {TextureStorage} from './gpu-textures.js';
import {ShaderObjects} from './shader-objects.js';
import {createShaderTranslator} from './shaders.js';
import {RUNTIME_MODES,runtimeModeInfo} from './runtime-mode.js';
// Owns WebGPU resources and the canvas. CPU execution runs in another worker.
import {GeometryBuffers} from './gpu-buffers.js';
import {D3D9RenderState,RS} from './d3d9-state.js';
let gpuTiming=false;
let shaderMode=RUNTIME_MODES.WINED3D;
let sceneEquivalence=false,omitDiagnosticLighting=false;
let diagnosticDraws=0,diagnosticAfterPresent=0,diagnosticSkip=0,drawStateTrace=0,captureFrames=false,cameraTest=false;const cameraSamples=new Set(),drawStateFingerprints=new Set();let metrics;const bridgeMetrics={drawBatches:0,batchedClears:0,batchedDraws:0,batchedUploads:0,uploadedBytes:0,maxBatchCommands:0,stagingBytes:16*1024*1024};
let device,canvas,context,windowSize,backend,nextId=1,port,pending=0,waitingInput;
let nextAudioId=1;const audioStreams=new Map();
let nextMusicId=1;const musicTracks=new Set();
const inputQueue=[];
const emit=(type,data={})=>postMessage({type,...data});
const INVALID=0x8876086c,UNAVAILABLE=0x8876086a;
async function init(data){
 canvas=data.canvas;port=data.port;gpuTiming=!!data.gpuTiming;shaderMode=runtimeModeInfo(data.runtimeMode??RUNTIME_MODES.WINED3D).mode;sceneEquivalence=!!data.sceneEquivalence;omitDiagnosticLighting=data.sceneEquivalenceControl==='omitLighting';diagnosticDraws=Number.isInteger(data.drawDiagnostics)?Math.max(0,Math.min(64,data.drawDiagnostics)):data.drawDiagnostics?3:0;diagnosticAfterPresent=Number.isInteger(data.diagnosticAfterPresent)?Math.max(0,data.diagnosticAfterPresent):0;diagnosticSkip=Number.isInteger(data.diagnosticSkip)?Math.max(0,Math.min(4096,data.diagnosticSkip)):0;drawStateTrace=Number.isInteger(data.drawStateTrace)?Math.max(0,Math.min(256,data.drawStateTrace)):0;drawStateFingerprints.clear();captureFrames=!!data.captureFrames;cameraTest=!!data.cameraTest;cameraSamples.clear();metrics=new PresentationMetrics(data.startEpoch??(performance.timeOrigin+performance.now()));
 const result={secureContext:isSecureContext,crossOriginIsolated,sharedArrayBuffer:typeof SharedArrayBuffer!=='undefined',webgpu:!!navigator.gpu,userAgent:navigator.userAgent,runtime:runtimeModeInfo(shaderMode)};
 const adapter=await navigator.gpu?.requestAdapter();if(!adapter)throw Error('no WebGPU adapter');
 const i=adapter.info;result.adapter=Object.fromEntries(['vendor','architecture','device','description','isFallbackAdapter'].map(k=>[k,i[k]??null]));result.features=[...adapter.features];
 const requiredFeatures=adapter.features.has('texture-compression-bc')?['texture-compression-bc']:[];result.timestampQuery={requested:gpuTiming,available:adapter.features.has('timestamp-query')};if(gpuTiming&&result.timestampQuery.available)requiredFeatures.push('timestamp-query');
 device=await adapter.requestDevice({requiredFeatures});device.addEventListener('uncapturederror',e=>emit('gpu-error',{message:e.error.message}));device.lost.then(i=>emit('gpu-lost',{reason:i.reason,message:i.message}));
 result.deviceCreated=true;result.hardwareAcceleration='GPU device available; no Humus scene verified';
 let chain=Promise.resolve();port.onmessage=({data})=>{if(++pending>64){emit('gpu-error',{message:'GPU command queue limit exceeded'});return}chain=chain.then(()=>dispatch(data)).catch(e=>emit('gpu-error',{message:String(e)})).finally(()=>pending--)};
 port.start();port.postMessage({ready:true,result});emit('probe',{result});
}
function reply(buffer,address,result){if(!(buffer instanceof SharedArrayBuffer)||!Number.isInteger(address)||address<4||address%4||address+4>buffer.byteLength)throw Error('invalid GPU reply pointer');const words=new Int32Array(buffer);Atomics.store(words,address/4,result|0);Atomics.notify(words,address/4,1);}
async function dispatch(data){
 const {func,args,buffer,retAddr,payload}=data;
 if(func==='draw_batch'){await executeDrawBatch(data,graphics,drawPacket);bridgeMetrics.drawBatches++;for(const a of data.commands){if(a[0]===3)bridgeMetrics.batchedClears++;else if(a[0]===13)bridgeMetrics.batchedDraws++;else if(a[0]===6||a[0]===11){bridgeMetrics.batchedUploads++;bridgeMetrics.uploadedBytes+=a.at(-1);}}bridgeMetrics.maxBatchCommands=Math.max(bridgeMetrics.maxBatchCommands,data.commands.length);return;}
 let result=INVALID;
 if(func==='poll_message'||func==='wait_message'){
  if(!inputQueue.length&&func==='wait_message'){if(waitingInput)throw Error('duplicate input wait');waitingInput={buffer,retAddr};return}
  inputReply(buffer,retAddr,inputQueue.shift()??[-1,0,0,0]);return;
 }
 try{
  if(!Array.isArray(args)||args.length>64)throw Error('invalid GPU command args');
  if(func==='create_window'){
   const [title,width,height]=args;if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)throw Error('invalid window size');
   canvas.width=width;canvas.height=height;windowSize=[width,height];emit('window-created',{title,width,height});result=1;
  }else if(func==='audio_open'){
   const [sampleRate,channels]=args;
   if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||!Number.isInteger(channels)||channels<1||channels>8)throw Error('invalid audio format');
   const id=nextAudioId++;audioStreams.set(id,{sampleRate,channels,queuedBytes:0,lastUpdate:performance.now()});
   emit('audio-open',{streamId:id,sampleRate,channels});result=id;
  }else if(func==='audio_queued'){
   const stream=audioStreams.get(args[0]);if(!stream)return INVALID;
   const now=performance.now();stream.queuedBytes=Math.max(0,stream.queuedBytes-(now-stream.lastUpdate)*stream.sampleRate/1000*stream.channels*2);stream.lastUpdate=now;result=Math.floor(stream.queuedBytes);
  }else if(func==='audio_resume'){
   if(!audioStreams.has(args[0]))return INVALID;
   emit('audio-resume',{streamId:args[0]});result=1;
  }else if(func==='audio_write'){
   const stream=audioStreams.get(args[0]);
   if(!stream||!(payload instanceof ArrayBuffer)||!Number.isInteger(args[1])||args[1]!==payload.byteLength)return INVALID;
   const now=performance.now();stream.queuedBytes=Math.max(0,stream.queuedBytes-(now-stream.lastUpdate)*stream.sampleRate/1000*stream.channels*2);stream.lastUpdate=now;stream.queuedBytes=Math.min(stream.queuedBytes+payload.byteLength,stream.sampleRate*stream.channels*2*2);
   postMessage({type:'audio-write',streamId:args[0],data:payload},[payload]);result=1;
  }else if(func==='music_load'){
   if(args.length!==2||!Number.isInteger(args[0])||args[0]<1||!Number.isInteger(args[1])||!(payload instanceof ArrayBuffer)||payload.byteLength!==args[0])return INVALID;
   const id=nextMusicId++;musicTracks.add(id);postMessage({type:'music-load',handle:id,flags:args[1]>>>0,data:payload},[payload]);result=id;
  }else if(func==='music_command'){
   if(args.length!==5||args.some(value=>!Number.isInteger(value)))return INVALID;
   const [op,handle,a,b,c]=args;
   if(op===1){if(!musicTracks.has(handle))return INVALID;emit('music-play',{handle,start:a>>>0,flags:b>>>0,restart:!!c});}
   else if(op===2){if(handle&&!musicTracks.has(handle))return INVALID;emit('music-stop',{handle});}
   else if(op===3){if(!musicTracks.has(handle))return INVALID;emit('music-attributes',{handle,frequency:a,volume:b,pan:c});}
   else if(op===4){musicTracks.clear();emit('music-free-all');}
   else return INVALID;
   result=1;
  }else if(func==='graphics_call'){
   const [op,...values]=args;if(values.some(v=>!Number.isInteger(v)||v<0||v>0xffffffff))throw Error('invalid graphics argument');
   result=await graphics(op,values,buffer);
  }else throw Error('unsupported GPU host operation '+func);
 }catch(e){emit('gpu-error',{message:String(e.stack??e)});}
 finally{if(retAddr)reply(buffer,retAddr,result)}
}
function drawPacket(a,memory){
 if(a.length!==3)return INVALID;
 let packet;
 try{
  packet=decodeDraw(memory,a[1],a[2]);
  if(drawStateTrace>0){
   const textureStages=packet.textureStages.map(stage=>Array.from(stage)),textures=Array.from(packet.textures.slice(0,8));
   const textureInfo=textures.map(id=>{if(!id)return null;const texture=backend.textures.get(id);return{id,width:texture.width,height:texture.height,levels:texture.levels,format:texture.format,gpuFormat:texture.gpuFormat,uploads:texture.uploads};});
   const sample={present:backend.presents+1,fixed:Boolean(packet.fixed),vertex:packet.vertex,pixel:packet.pixel,kind:packet.kind,count:packet.count,textures,textureInfo,sampler0:Array.from(packet.samplers[0]),textureStages,lightingHeader:packet.lighting?Array.from(packet.lighting.slice(0,4)):null,state:packet.state.values,declaration:Array.from(packet.declaration)};
   const fingerprint=JSON.stringify([sample.fixed,sample.vertex,sample.pixel,sample.kind,textures,textureStages,sample.lightingHeader,sample.state,sample.declaration]);
   if(!drawStateFingerprints.has(fingerprint)){drawStateFingerprints.add(fingerprint);drawStateTrace--;emit('draw-state',{sample});}
  }
  if(cameraTest&&[0,29,59].includes(backend.presents)&&!cameraSamples.has(backend.presents)){cameraSamples.add(backend.presents);emit('camera-sample',{present:backend.presents+1,matrixWords:Array.from(packet.registers[0][0].slice(0,16))});}
  if(cameraTest&&backend.presents===0){backend.traceCount??=0;if(backend.traceCount++<128)emit('render-state-sample',{draw:backend.traceCount,vertex:packet.vertex,pixel:packet.pixel,state:packet.state.values});}
  backend.draws??=new DrawRenderer(device,backend);
  const submit=()=>{
   const drawn=backend.draws.draw(packet);
   if(drawn?.then)return drawn.then(()=>backend.equivalence?.draw(packet)).then(()=>{backend.submissions++;return 1;});
   const equivalent=backend.equivalence?.draw(packet);
   return equivalent?.then?equivalent.then(()=>{backend.submissions++;return 1;}):(backend.submissions++,1);
  };
  if(diagnosticDraws>0&&backend.presents>=diagnosticAfterPresent){if(diagnosticSkip>0){diagnosticSkip--;}else{diagnosticDraws--;backend.draws.flush();return captureDraw(device,backend,packet).then(sample=>{emit('draw-diagnostic',{sample});return submit();});}}
  return submit();
 }catch(e){const message=String(e.stack??e);emit('draw-rejected',{message:`${message} declaration=${JSON.stringify(packet?Array.from(packet.declaration):null)}`});return INVALID;}
}
async function graphics(op,a,memory){
 if(op===14){if(a.length!==1||!(memory instanceof SharedArrayBuffer)||a[0]<4096||a[0]%4||a[0]+304>memory.byteLength)return INVALID;new Uint32Array(memory,a[0],76).set(deviceCaps());return 1;}
 if(op===15){return a.length===3&&supportsFormat(device,...a)?1:UNAVAILABLE;}

 if(op===1){
  if(backend)throw Error('second D3D9 device unsupported');
  const [width,height,format,count,multi,quality,swap,hwnd,windowed,autoDepth,depthFormat,flags,refresh,interval]=a;
  const deviceParamsValid=a.length===14&&!!windowSize&&width===windowSize[0]&&height===windowSize[1]&&[21,22,23,24,25,26].includes(format)&&count===1&&multi===0&&quality===0&&[1,2,3].includes(swap)&&hwnd<=1&&[0,1].includes(windowed)&&autoDepth===1&&[0,71,75].includes(depthFormat)&&flags===0&&refresh===0&&[0,1,0x80000000].includes(interval);
  if(!deviceParamsValid){emit('d3d9-device-rejected',{params:a,windowSize,reason:'unsupported device parameters'});return UNAVAILABLE;}
  device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');
  context=canvas.getContext('webgpu');if(!context)throw Error('WebGPU canvas context unavailable');
  context.configure({device,format:'bgra8unorm',alphaMode:'opaque',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST});
  const color=device.createTexture({label:'D3D9 backbuffer',size:[width,height],format:'bgra8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  const depth=device.createTexture({label:'D3D9 D24S8',size:[width,height],format:'depth24plus-stencil8',usage:GPUTextureUsage.RENDER_ATTACHMENT});
  const oom=await device.popErrorScope(),validation=await device.popErrorScope();if(oom||validation){color.destroy();depth.destroy();throw Error((oom??validation).message)}
  backend={id:nextId++,color,depth,width,height,state:new D3D9RenderState(),buffers:new GeometryBuffers(device),textures:new TextureStorage(device,{traceUploads:drawStateTrace>0}),shaders:null,presents:0,submissions:0};
  if(gpuTiming&&device.features.has('timestamp-query'))backend.timer=new GpuTiming(device);
  if(sceneEquivalence)backend.equivalence=new SceneEquivalence(device,backend,omitDiagnosticLighting);
  emit('d3d9-device-created',{backendId:backend.id,width,height,colorFormat:'bgra8unorm',depthFormat:'depth24plus-stencil8',validation:'passed',sceneFrames:0});return backend.id;
 }
 if(!backend||a[0]!==backend.id)return INVALID;
 if(op===2){backend.timer?.dispose();backend.equivalence?.dispose();backend.draws?.dispose();backend.textures.dispose();backend.shaders?.dispose();backend.buffers.dispose();backend.color.destroy();backend.depth.destroy();context.unconfigure();backend=null;return 1}
 if(op===3){ // Clear full attachment; rectangle clears remain unsupported.
  backend.draws?.flush();
  const [,flags,argb,zBits,stencil]=a;if(a.length!==5||!flags||(flags&~7))return INVALID;
  const z=new Float32Array(new Uint32Array([zBits]).buffer)[0];if(!Number.isFinite(z)||z<0||z>1)return INVALID;
  const colorValue={r:((argb>>>16)&255)/255,g:((argb>>>8)&255)/255,b:(argb&255)/255,a:(argb>>>24)/255};
  const enc=device.createCommandEncoder();
  const pass=enc.beginRenderPass({colorAttachments:[{view:backend.color.createView(),loadOp:flags&1?'clear':'load',storeOp:'store',clearValue:colorValue}],depthStencilAttachment:{view:backend.depth.createView(),depthLoadOp:flags&2?'clear':'load',depthStoreOp:'store',depthClearValue:z,stencilLoadOp:flags&4?'clear':'load',stencilStoreOp:'store',stencilClearValue:stencil&255}});pass.end();device.queue.submit([enc.finish()]);
  backend.equivalence?.clear(flags,colorValue,z,stencil&255);
  emit('gpu-submission',{kind:'clear',count:++backend.submissions,sceneFrames:0});return 1;
 }
 if(op===4){ // Ordinary presentation is GPU-to-GPU; opt-in diagnostic samples separately.
  backend.draws?.flush();
  if(backend.timer){const sample=await backend.timer.finish(backend.presents+1);if(sample)emit('gpu-timing',{sample});}
  if(backend.equivalence){const sample=await backend.equivalence.compare(backend.presents+1);if(sample)emit('scene-equivalence',{sample});}
  const enc=device.createCommandEncoder();enc.copyTextureToTexture({texture:backend.color},{texture:context.getCurrentTexture()},[backend.width,backend.height]);device.queue.submit([enc.finish()]);backend.presents++;if(backend.presents===1)emit('realm-resources',{sample:resourceMetrics(performance,'gpuWorker','first Present submission')});backend.submissions++;metrics.present(performance.timeOrigin+performance.now());if(backend.presents===1||backend.presents%60===0){const began=performance.now(),completedPresent=backend.presents;device.queue.onSubmittedWorkDone().then(()=>{metrics.completions.push({present:completedPresent,latencyMs:performance.now()-began});if(metrics.completions.length>32)metrics.completions.shift();});emit('performance-sample',{sample:{...metrics.snapshot(),drawBridge:{...bridgeMetrics},rendererWrites:backend.draws?.snapshotMetrics()??null,wasmLinearMemoryBytes:memory.byteLength,geometryGPUBytes:backend.buffers.bytes,textureGPUBytes:backend.textures.bytes,colorLogicalBytes:backend.width*backend.height*4,depthStencilLogicalMinimumBytes:backend.width*backend.height*4,pipelineCacheEntries:backend.draws?.cache.items.size??0,shaderObjects:backend.shaders?.objects.size??0,gpuTimingEnabled:gpuTiming,captureEnabled:captureFrames,sceneEquivalenceEnabled:sceneEquivalence,cameraTestEnabled:cameraTest}});}if(captureFrames&&[1,30,60].includes(backend.presents))emit('frame-capture',{sample:await captureFrame(device,backend.color,backend.presents,metrics.startEpoch)});if(cameraTest&&[1,30].includes(backend.presents)){const message=[backend.presents===1?5:6,72,38,1];input(message);emit('controlled-input',{present:backend.presents,message,key:'ArrowUp',action:message[0]===5?'down':'up'});}emit('application-present',{count:backend.presents,submittedFrames:backend.presents,sceneFrames:0});return 1;
 }
 if(op>=5&&op<=7){
  try{
   if(op===5&&a.length===4)return await backend.buffers.create(a[1],a[2],a[3]);
   if(op===6&&a.length===5){await backend.buffers.upload(a[1],a[2],memory,a[3],a[4],backend.draws);return 1;}
   if(op===7&&a.length===2){backend.draws?.flush();backend.buffers.destroy(a[1]);return 1;}
   return INVALID;
  }catch(e){if(e instanceof RangeError)return INVALID;throw e;}
 }
 if(op===8||op===9){
  try{
   if(op===8&&a.length===4){
    const [,stage,pointer,length]=a;
    if(!(memory instanceof SharedArrayBuffer)||pointer<4096||length<8||length>1048576||length%4||pointer+length>memory.byteLength)return INVALID;
    backend.shaders??=new ShaderObjects(await createShaderTranslator(shaderMode));
    return backend.shaders.create(stage,new Uint8Array(memory,pointer,length));
   }
   if(op===9&&a.length===2){if(!backend.shaders)return INVALID;backend.draws?.flush();backend.shaders.destroy(a[1]);return 1;}
   return INVALID;
  }catch(e){emit('shader-rejected',{message:String(e)});return INVALID;}
 }
 if(op>=10&&op<=12){
  try{
   if(op===10&&a.length===5)return await backend.textures.create(a[1],a[2],a[3],a[4]);
   if(op===11&&a.length===6){backend.draws?.flush();await backend.textures.upload(a[1],a[2],memory,a[3],a[4],a[5]);return 1;}
   if(op===12&&a.length===2){backend.draws?.flush();backend.textures.destroy(a[1]);return 1;}
   return INVALID;
  }catch(e){if(e instanceof RangeError)return INVALID;throw e;}
 }
 if(op===13&&a.length===3){
  return drawPacket(a,memory);
 }
 throw Error('unsupported graphics opcode '+op);
}
function inputReply(buffer,address,message){
 if(!(buffer instanceof SharedArrayBuffer)||!Number.isInteger(address)||address<4||address%4||address+16>buffer.byteLength)throw Error('invalid input reply pointer');
 const words=new Int32Array(buffer);for(let i=1;i<4;i++)Atomics.store(words,address/4+i,message[i]);reply(buffer,address,message[0]);
}
function input(message){
 if(!Array.isArray(message)||message.length!==4||message.some(v=>!Number.isInteger(v))||![2,3,4,5,6].includes(message[0]))throw Error('invalid input message');
 if(waitingInput){const w=waitingInput;waitingInput=null;inputReply(w.buffer,w.retAddr,message);return}
 if(message[0]===4&&inputQueue.at(-1)?.[0]===4)inputQueue[inputQueue.length-1]=message;
 else if(inputQueue.length<256)inputQueue.push(message);
 else emit('gpu-error',{message:'input queue capacity exceeded'});
}
self.onmessage=({data})=>{if(data.type==='input'){try{input(data.message)}catch(e){emit('gpu-error',{message:String(e)})}return}if(data.type==='init')init(data).catch(e=>{port?.postMessage({ready:false,error:String(e)});emit('gpu-error',{message:String(e)})})};
