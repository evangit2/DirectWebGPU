import {resourceMetrics} from './resource-metrics.js';
import {DrawBatch} from './draw-batch.js';
import {AssetCache} from './asset-cache.js';
import {takeSharedInput,writeInputReply} from './input-transport.js';
let memory, device, lastPanic, gpuPort, inputQueue, drawBatch, logCount=0, persistedFiles=new Map();
const send=(type,data={})=>{if(type==='log'&&String(data.message).startsWith('GUEST_MEMORY ')){postMessage({type:'guest-memory',sample:JSON.parse(String(data.message).slice(13))});return;}if(type==='log'&&String(data.message).includes('kernel32/heap.rs:'))return;if(type==='log'&&String(data.message).includes('D3D9_CREATE9 sdk='))postMessage({type:'d3d9-created',message:data.message});if(type==='log'&&++logCount>500&&!String(data.message).includes('panicked at'))return;postMessage({type,...data})};
const text=(value)=>String(value).slice(0,4096);
const originalError=console.error;
console.error=(...args)=>{const message=args.map(text).join(' ');if(message.includes('panicked at'))lastPanic=message.split('\n\nStack:')[0];send('log',{message});originalError(...args)};
console.log=(...args)=>send('log',{message:args.map(text).join(' ')});
console.warn=console.log;
async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')}
async function gpuProbe(){
 const result={secureContext:isSecureContext,crossOriginIsolated,sharedArrayBuffer:typeof SharedArrayBuffer!=='undefined',webgpu:!!navigator.gpu,userAgent:navigator.userAgent};
 if(!navigator.gpu)return {...result,hardwareAcceleration:'not verified',reason:'navigator.gpu unavailable'};
 const adapter=await navigator.gpu.requestAdapter();
 if(!adapter)return {...result,hardwareAcceleration:'not verified',reason:'no adapter'};
 const i=adapter.info;
 result.adapter=i?Object.fromEntries(['vendor','architecture','device','description','isFallbackAdapter'].map(k=>[k,i[k]??null])):null;
 result.features=[...adapter.features];
 device=await adapter.requestDevice();
 device.addEventListener('uncapturederror',e=>send('gpu-error',{message:e.error.message}));
 device.lost.then(info=>send('gpu-lost',{reason:info.reason,message:info.message}));
 result.deviceCreated=true;
 // Identity is evidence, not proof that Humus submitted hardware-rendered frames.
 result.hardwareAcceleration='adapter/device available; Humus GPU rendering not verified';
 return result;
}
self.send_to_host=(func,args,retAddr)=>{
 if(func==='console_write'){
  const [ptr,len]=args;
  if(!Number.isInteger(ptr)||!Number.isInteger(len)||ptr<0||len<0||ptr+len>memory.buffer.byteLength)throw Error('host console pointer out of bounds');
  send('log',{message:new TextDecoder().decode(new Uint8Array(memory.buffer,ptr,Math.min(len,8192)).slice())});return;
 }
 if(func==='write_file'){
  const [path,ptr,len]=args;
  if(typeof path!=='string'||!Number.isInteger(ptr)||!Number.isInteger(len)||ptr<0||len<0||ptr+len>memory.buffer.byteLength)throw Error('invalid persisted file');
  persistedFiles.set(path,new Uint8Array(memory.buffer.slice(ptr,ptr+len)));
  if(Number.isInteger(retAddr)&&retAddr>=4&&retAddr%4===0&&retAddr+4<=memory.buffer.byteLength){Atomics.store(new Int32Array(memory.buffer),retAddr/4,1);Atomics.notify(new Int32Array(memory.buffer),retAddr/4,1);}
  return;
 }
 if(func==='poll_message'||func==='wait_message'){
  if(!inputQueue)throw Error('input transport unavailable');
  writeInputReply(memory.buffer,retAddr,takeSharedInput(inputQueue,func==='wait_message'));return;
 }
 if(['create_window','cursor_warp','cursor_visibility','graphics_call','audio_open','audio_queued','audio_resume','audio_write','music_load','music_command'].includes(func)){
  if(!gpuPort)throw Error('GPU transport unavailable');
  const values=Array.from(args);
  if(func==='audio_write'){
   if(values.length!==3||!values.every(Number.isInteger)||values[0]<1||values[1]<4096||values[2]<0||values[1]+values[2]>memory.buffer.byteLength)throw Error('invalid audio write range');
   const copy=new Uint8Array(values[2]);copy.set(new Uint8Array(memory.buffer,values[1],values[2]));
   gpuPort.postMessage({func,args:[values[0],values[2]],payload:copy.buffer,retAddr:0},[copy.buffer]);return;
  }
  if(func==='music_load'){
   if(values.length!==3||!values.every(Number.isInteger)||values[0]<4096||values[1]<1||values[0]+values[1]>memory.buffer.byteLength)throw Error('invalid music load range');
   const copy=new Uint8Array(values[1]);copy.set(new Uint8Array(memory.buffer,values[0],values[1]));
   gpuPort.postMessage({func,args:[values[1],values[2]],payload:copy.buffer,buffer:memory.buffer,retAddr},[copy.buffer]);return;
  }
  if(func==='graphics_call'&&[3,4,6,11,13].includes(values[0])){
   if(!Number.isInteger(retAddr)||retAddr<4||retAddr%4||retAddr+4>memory.buffer.byteLength)throw Error('invalid queued draw reply pointer');
   if(drawBatch.enqueue(values,memory.buffer)){
    // Present is the frame boundary. Posting it in the batch keeps all work
    // ordered and lets the GPU worker retain this ring slot until the submitted
    // frame actually completes. A second slot still lets the translated CPU
    // prepare one frame ahead without creating an unbounded WebGPU queue.
    if(values[0]===4)drawBatch.flush();
    Atomics.store(new Int32Array(memory.buffer),retAddr/4,1);return;
   }
  }
  drawBatch.flush();
  gpuPort.postMessage({func,args:values,buffer:memory.buffer,retAddr});return;
 }
 // Unsupported host operations fail locally instead of leaving a blocked worker.
 throw Error(`unsupported host operation: ${func}; args=${JSON.stringify(args)} returnPointer=${retAddr}`);
};
self.onmessage=async({data})=>{
 try{
  if(data.type==='probe'){send('probe',{result:await gpuProbe()});return}
  if(data.type!=='start')throw Error('unsupported worker command');
  gpuPort=data.gpuPort;inputQueue=data.inputQueue;drawBatch=new DrawBatch(message=>gpuPort.postMessage(message));
  await new Promise((resolve,reject)=>{gpuPort.onmessage=({data})=>{if(data.ready)resolve(data.result);else reject(Error(data.error??'GPU initialization failed'))};gpuPort.start();});
  const build=data.build;
  const guest=build.guest??build.runtimeBuild?.guest;
  if(!guest?.id||!build.runtimeBuild?.moduleUrl||!build.runtimeBuild?.wasmUrl)throw Error('guest runtime manifest is incomplete');
  const exeFile=build.files.find(f=>f.path===build.dependencies.executable.path);
  if(!exeFile)throw Error('original executable missing from asset manifest');
  const cleanUrl=(value)=>String(value).replace(/^\/+/, '');
  const assetUrl=(path)=>`assets/${path}`;
  const wasmUrl=cleanUrl(build.runtimeBuild.wasmUrl);
  const moduleUrl=cleanUrl(build.runtimeBuild.moduleUrl);
  const wasmEntry=build.runtimeBuild.artifacts[build.runtimeBuild.wasmArtifact];
  const cache=new AssetCache(data.assetCache??'warm',[...build.files.map(f=>({...f,url:assetUrl(f.path)})),{...wasmEntry,url:wasmUrl}],caches,fetch.bind(globalThis),location.origin);await cache.open(wasmEntry.sha256);
  const bytes=await cache.load(assetUrl(exeFile.path));
  const actual=await hash(bytes);
  if(actual!==build.dependencies.executable.sha256)throw Error(`original executable hash mismatch: ${actual}`);
  send('identity',{sha256:actual});
  if(!build.wasm_available)throw Error(`${guest.title} WASM build missing; run scripts/build_wasm.sh [profile] ${guest.id}`);
  const exe=await import(new URL(`./${moduleUrl}`,import.meta.url));
  // Initial memory is only 16 MiB; WASM allocations grow it as needed.
  memory=new WebAssembly.Memory({initial:256,maximum:8192,shared:true});
  const wasmBytes=await cache.load(wasmUrl);
  if(await hash(wasmBytes)!==wasmEntry.sha256)throw Error('WASM artifact hash mismatch');
  if(build.runtimeBuild.executableSha256!==actual)throw Error('WASM was built for a different EXE');
  await exe.default({memory,module_or_path:wasmBytes});
  for(const f of build.files){
   const fileBytes=f.path===exeFile.path?bytes:await cache.load(assetUrl(f.path));
   if(await hash(fileBytes)!==f.sha256)throw Error('asset integrity mismatch: '+f.path);
   exe.mount_file('/'+f.path,new Uint8Array(fileBytes));
  }
  exe.set_current_dir(guest.workingDirectory);
  if(data.resolution==='1280x720'){
   for(const [root,subkey,name,value] of guest.registryDwords??[])exe.seed_registry_dword(root,subkey,name,value);
   if(guest.registryDwords?.length)send('launch-settings',{source:'guest manifest registry seed',resolution:'1280x720',mechanism:'original EXE enumerates saved window bounds'});
  }
  if(data.registryPreset!==null&&data.registryPreset!==undefined){
   if(typeof data.registryPreset!=='string'||data.registryPreset.length>64)throw Error('invalid registry preset');
   const preset=guest.registryPresets?.[data.registryPreset];if(!preset||!Array.isArray(preset.values))throw Error('unknown registry preset');
   for(const value of preset.values){
    if(!Array.isArray(value)||value.length!==5||!Array.isArray(value[4])||value[4].some(byte=>!Number.isInteger(byte)||byte<0||byte>255))throw Error('invalid registry preset value');
    exe.seed_registry_value(value[0],value[1],value[2],value[3],Uint8Array.from(value[4]));
   }
   send('launch-settings',{source:'guest registry preset',preset:data.registryPreset,values:preset.values.length});
  }
  exe.configure_guest_memory_metrics(data.guestMemory===true);
  exe.set_trace(data.trace??'');
  send('asset-cache-metrics',{...cache.stats});
  const resources=performance.getEntriesByType('resource');send('resource-metrics',{resourceCount:resources.length,transferSize:resources.reduce((n,r)=>n+r.transferSize,0),encodedBodySize:resources.reduce((n,r)=>n+r.encodedBodySize,0),decodedBodySize:resources.reduce((n,r)=>n+r.decodedBodySize,0),scope:'CPU worker resources loaded before EXE starts; GPU-worker shader runtime and page resources excluded',cachePolicy:'loopback server Cache-Control: no-store'});
  send('realm-resources',{sample:resourceMetrics(performance,'cpuWorker','before EXE execution')});
  send('execution-start',{wasmLinearMemoryBytes:memory.buffer.byteLength});
  const started=performance.now();
  exe.main();
  drawBatch.drain();
  send('returned',{executionMs:performance.now()-started,wasmLinearMemoryBytes:memory.buffer.byteLength});
 }catch(error){send('failed',{message:text(lastPanic||error.stack||error),wasmLinearMemoryBytes:memory?.buffer.byteLength??null});}
};
