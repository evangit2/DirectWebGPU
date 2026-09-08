let memory, device, lastPanic, gpuPort, logCount=0;
const send=(type,data={})=>{if(type==='log'&&String(data.message).includes('kernel32/heap.rs:'))return;if(type==='log'&&String(data.message).includes('D3D9_CREATE9 sdk='))postMessage({type:'d3d9-created',message:data.message});if(type==='log'&&++logCount>500&&!String(data.message).includes('panicked at'))return;postMessage({type,...data})};
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
  send('log',{message:new TextDecoder().decode(new Uint8Array(memory.buffer,ptr,Math.min(len,4096)).slice())});return;
 }
 if(['create_window','graphics_call','poll_message','wait_message'].includes(func)){
  if(!gpuPort)throw Error('GPU transport unavailable');
  gpuPort.postMessage({func,args:Array.from(args),buffer:memory.buffer,retAddr});return;
 }
 // Unsupported host operations fail locally instead of leaving a blocked worker.
 throw Error(`unsupported host operation: ${func}; args=${JSON.stringify(args)} returnPointer=${retAddr}`);
};
self.onmessage=async({data})=>{
 try{
  if(data.type==='probe'){send('probe',{result:await gpuProbe()});return}
  if(data.type!=='start')throw Error('unsupported worker command');
  gpuPort=data.gpuPort;
  await new Promise((resolve,reject)=>{gpuPort.onmessage=({data})=>{if(data.ready)resolve(data.result);else reject(Error(data.error??'GPU initialization failed'))};gpuPort.start();});
  const build=data.build;
  const exeFile=build.files.find(f=>f.path===build.dependencies.executable.path);
  if(!exeFile)throw Error('original executable missing from asset manifest');
  const bytes=await (await fetch('/assets/'+exeFile.path)).arrayBuffer();
  const actual=await hash(bytes);
  if(actual!==build.dependencies.executable.sha256)throw Error(`original executable hash mismatch: ${actual}`);
  send('identity',{sha256:actual});
  if(!build.wasm_available)throw Error('Humus WASM build missing; run scripts/build_wasm.sh');
  const exe=await import('/generated/humus.js');
  // Initial memory is only 16 MiB; WASM allocations grow it as needed.
  memory=new WebAssembly.Memory({initial:256,maximum:8192,shared:true});
  const wasmBytes=await(await fetch('/generated/humus_bg.wasm')).arrayBuffer();
  if(await hash(wasmBytes)!==build.runtimeBuild.artifacts['humus_bg.wasm'].sha256)throw Error('WASM artifact hash mismatch');
  if(build.runtimeBuild.executableSha256!==actual)throw Error('WASM was built for a different EXE');
  await exe.default({memory,module_or_path:wasmBytes});
  for(const f of build.files){
   const fileBytes=f.path===exeFile.path?bytes:await(await fetch('/assets/'+f.path)).arrayBuffer();
   if(await hash(fileBytes)!==f.sha256)throw Error('asset integrity mismatch: '+f.path);
   exe.mount_file('/'+f.path,new Uint8Array(fileBytes));
  }
  exe.set_current_dir('/DynamicBranching');
  exe.set_trace(data.benchmark?'':'kernel32,user32,advapi32,d3d9');
  const resources=performance.getEntriesByType('resource');send('resource-metrics',{resourceCount:resources.length,transferSize:resources.reduce((n,r)=>n+r.transferSize,0),encodedBodySize:resources.reduce((n,r)=>n+r.encodedBodySize,0),decodedBodySize:resources.reduce((n,r)=>n+r.decodedBodySize,0),scope:'CPU worker resources loaded before EXE starts; GPU-worker shader runtime and page resources excluded',cachePolicy:'loopback server Cache-Control: no-store'});
  send('execution-start',{wasmLinearMemoryBytes:memory.buffer.byteLength});
  const started=performance.now();
  exe.main();
  send('returned',{executionMs:performance.now()-started,wasmLinearMemoryBytes:memory.buffer.byteLength});
 }catch(error){send('failed',{message:text(lastPanic||error.stack||error),wasmLinearMemoryBytes:memory?.buffer.byteLength??null});}
};
