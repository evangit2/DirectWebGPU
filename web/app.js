import {resourceMetrics,memoryProbe} from './resource-metrics.js';
import {runtimeMode,runtimeModeInfo} from './runtime-mode.js';
function boundedPayload(){const copy={...report,events:[...report.events]};let data=JSON.stringify({token,report:copy});while(new TextEncoder().encode(data).length>240000&&copy.events.length){copy.events.shift();copy.droppedEvents++;data=JSON.stringify({token,report:copy})}return data}
const $=id=>document.getElementById(id);
let build,worker,gpuWorker,token,timer,probeWorker,HAS_BACKEND=false;
const selectedMode=runtimeMode(),selectedModeInfo=runtimeModeInfo(selectedMode);
class BrowserAudio {
 constructor(){this.context=null;this.streams=new Map();this.pending=[];this.bytes=0;this.buffers=0;}
 ensure(){
  if(this.context)return this.context;
  const C=globalThis.AudioContext??globalThis.webkitAudioContext;if(!C)return null;
  try{this.context=new C();}catch(_){return null}return this.context;
 }
 open(id,sampleRate,channels){this.ensure();this.streams.set(id,{sampleRate,channels,nextTime:0});}
 unlock(){const c=this.ensure();if(!c)return;void c.resume().then(()=>{const pending=this.pending.splice(0);for(const item of pending)this.write(item.id,item.data);audioDiagnostic('audio-unlocked');}).catch(()=>audioDiagnostic('audio-unlock-failed'));}
 write(id,data){
  const c=this.ensure(),s=this.streams.get(id);if(!c||!s)return;
  if(c.state!=='running'){if(this.pending.length<32)this.pending.push({id,data});return;}
  if(!(data instanceof ArrayBuffer)||data.byteLength<2||data.byteLength%2)return;
  const sourceBytes=new Int16Array(data),frames=Math.floor(sourceBytes.length/s.channels);if(!frames)return;
  const buffer=c.createBuffer(s.channels,frames,s.sampleRate);
  for(let channel=0;channel<s.channels;channel++){const out=buffer.getChannelData(channel);for(let frame=0;frame<frames;frame++)out[frame]=sourceBytes[frame*s.channels+channel]/32768;}
  const source=c.createBufferSource();source.buffer=buffer;source.connect(c.destination);const now=c.currentTime;s.nextTime=Math.max(s.nextTime,now+0.01);source.start(s.nextTime);s.nextTime+=buffer.duration;this.bytes+=data.byteLength;this.buffers++;
 }
}
const browserAudio=new BrowserAudio();
function audioDiagnostic(type,data={}){
 report.audio={contextState:browserAudio.context?.state??'unavailable',streams:browserAudio.streams.size,bytesScheduled:browserAudio.bytes,buffersScheduled:browserAudio.buffers,pendingChunks:browserAudio.pending.length,...data};
 if(new URL(location.href).searchParams.has('debugDiagnostics'))log(type,{message:JSON.stringify(report.audio)});
}
function benchmarkDuration(){const value=new URL(location.href).searchParams.get('benchmarkSeconds')??'60';if(!/^\d+$/.test(value)||Number(value)<60||Number(value)>600)throw Error('benchmarkSeconds must be an integer from 60 through 600');return Number(value)*1000;}
let report={runId:null,status:'idle',runtime:selectedModeInfo,events:[],droppedEvents:0,applicationPresents:0,submittedFrames:0,sceneFrames:0,performance:{firstSceneMs:'not measured',fps:'not measured',jsHeapBytes:'not measured',gpuBytes:'not measured'}};
function log(type,data={}){report.events.push({timeMs:Math.round(performance.now()),type,...data});if(report.events.length>250){report.events.shift();report.droppedEvents++}$('logs').textContent=report.events.map(e=>`${e.timeMs} ${e.type}: ${e.message??JSON.stringify(e.result??e)}`).join('\n');$('logs').scrollTop=$('logs').scrollHeight;}
async function upload(){if(!token)return;try{const r=await fetch('/api/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:boundedPayload()});if(!r.ok)throw Error('evidence upload '+r.status)}catch(e){log('upload-error',{message:e.message})}}
function stop(status='stopped'){clearTimeout(timer);worker?.terminate();worker=null;gpuWorker?.terminate();gpuWorker=null;report.status=status;report.endedAt=new Date().toISOString();report.diagnosticAttemptMs=performance.now()-report.startTimeMs;$('status').textContent=status;$('start').disabled=false;$('long').disabled=false;$('stop').disabled=true;void upload()}
async function start(long=false){
 if(worker||!build||$('start').disabled)return;
 browserAudio.unlock();
 $('start').disabled=true;$('long').disabled=true;
 if(!crossOriginIsolated){$('status').textContent='Cross-origin isolation not active yet — reload the page once (the service worker enables it on the second load).';$('start').disabled=false;$('long').disabled=false;return;}
 try{
  const measurementMs=benchmarkDuration();
  probeWorker?.terminate();probeWorker=null;
  report={applicationPresents:0,submittedFrames:0,sceneFrames:0,performance:{firstSceneMs:'not measured',fps:'not measured',jsHeapBytes:'not measured',gpuBytes:'not measured'},runtime:selectedModeInfo,runId:crypto.randomUUID(),status:'starting',events:[],droppedEvents:0,build,startTimeMs:performance.now(),startedAt:new Date().toISOString(),requestedDurationMs:long?14400000:new URL(location.href).searchParams.has('benchmark')?measurementMs:null,visibility:document.visibilityState};
  if(HAS_BACKEND){const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error('session creation '+response.status);token=(await response.json()).token;}
  $('start').disabled=true;$('long').disabled=true;$('stop').disabled=false;$('status').textContent=`Executing original ${build.guest.title} binary…`;
  // Keep runtime query parameters in the worker URL so a changed runtime mode
  // cannot reuse a browser-cached worker module from another run.
  const workerVersion=encodeURIComponent(`${build.runtimeBuild?.sourceSha256??build.runtimeBuild?.builtAt??build.revision}:${location.search}`);
  worker=new Worker(new URL(`./worker.js?guest=${encodeURIComponent(build.guest.id)}&v=${workerVersion}`,import.meta.url),{type:'module'});
  const activeRunId=report.runId;
  worker.onmessage=({data})=>{
   if(data.type==='audio-open'){browserAudio.open(data.streamId,data.sampleRate,data.channels);audioDiagnostic('audio-open',{sampleRate:data.sampleRate,channels:data.channels});return;}
   if(data.type==='audio-write'){browserAudio.write(data.streamId,data.data);audioDiagnostic('audio-write');return;}
   if(data.type==='audio-resume'){browserAudio.unlock();audioDiagnostic('audio-resume');return;}
   if(!worker||report.runId!==activeRunId)return;
   const {type,...rest}=data;if(type==='performance-sample'){report.presentationMetrics=rest.sample;const elapsedMs=performance.now()-report.startTimeMs;report.stabilitySamples??=[];if(!report.stabilitySamples.length||elapsedMs-report.stabilitySamples.at(-1).elapsedMs>=30000){if(report.stabilitySamples.length<21){const m=rest.sample;report.stabilitySamples.push({elapsedMs,applicationPresents:report.applicationPresents,wasmLinearMemoryBytes:m.wasmLinearMemoryBytes,geometryGPUBytes:m.geometryGPUBytes,textureGPUBytes:m.textureGPUBytes,pipelineCacheEntries:m.pipelineCacheEntries,shaderObjects:m.shaderObjects,submissionFPS:m.submissionFPS});}}if(new URL(location.href).searchParams.has('debugDiagnostics'))log(type,{message:`present=${report.applicationPresents} submissionFPS=${rest.sample.submissionFPS??'n/a'} p95=${rest.sample.frameTimeMs?.p95??'n/a'}ms gpuQueue=${rest.sample.queueCompletionSamples?.at(-1)?.latencyMs?.toFixed?.(1)??'n/a'}ms drawBatches=${rest.sample.drawBridge?.drawBatches??'n/a'} batchedDraws=${rest.sample.drawBridge?.batchedDraws??'n/a'} batchedUploads=${rest.sample.drawBridge?.batchedUploads??'n/a'}`});return;}if(['controlled-input','camera-sample','render-state-sample'].includes(type)){report.inputTest??=[];if(report.inputTest.length<140)report.inputTest.push({type,...rest});return;}if(type==='guest-memory'){report.guestMemory??=[];if(report.guestMemory.length<11)report.guestMemory.push(rest.sample);return;}if(type==='realm-resources'){report.realmResources??={};report.realmResources[rest.sample.realm]=rest.sample;return;}if(type==='gpu-timing'){report.gpuTiming??=[];if(report.gpuTiming.length>=128)report.gpuTiming.shift();report.gpuTiming.push(rest.sample);return;}if(type==='scene-equivalence'){report.sceneEquivalence??=[];if(report.sceneEquivalence.length<3)report.sceneEquivalence.push(rest.sample);return;}if(type==='frame-capture'){report.frameCaptures??=[];if(report.frameCaptures.length<3)report.frameCaptures.push(rest.sample);if(new URL(location.href).searchParams.has('debugDiagnostics'))log(type,{message:`present=${rest.sample.present} nonblack=${rest.sample.sceneRegion?.nonblackPixels??'n/a'}/${rest.sample.sceneRegion?.pixels??'n/a'} mean=${rest.sample.sceneRegion?.meanRgb?.join(',')??'n/a'}`});return;}if(type==='draw-diagnostic'){report.drawDiagnostics??=[];if(report.drawDiagnostics.length<3)report.drawDiagnostics.push(rest.sample);if(new URL(location.href).searchParams.has('debugDiagnostics'))log(type,{message:`fixed=${rest.sample.fixed?1:0} vertex=${rest.sample.vertex} pixel=${rest.sample.pixel} kind=${rest.sample.kind} count=${rest.sample.count} textures=${rest.sample.textures?.join(',')??'n/a'} sampler0=${rest.sample.samplers?.[0]?.join(',')??'n/a'} texture0=${rest.sample.textureInfo?.[0]?JSON.stringify(rest.sample.textureInfo[0]):'n/a'} state=${JSON.stringify(Object.fromEntries(Object.entries(rest.sample.state??{}).filter(([k])=>['7','14','22','23','27','168'].includes(k))))} viewport=${rest.sample.viewport?.join(',')??'n/a'} inputs=${rest.sample.pair?.vertex?.inputs?.map(i=>`${i.usage}:${i.index}@${i.location}`).join(',')??'n/a'} samplers=${rest.sample.pair?.pixel?.samplers?.length??'n/a'} declarationBytes=${rest.sample.declaration?.length??0} geometry=${(rest.sample.geometry??[]).map(g=>`${g.slot}:${g.stride}/${g.bytes.length} first=${g.bytes.slice(0,40).join('.')} verts=${JSON.stringify(g.float32?.slice(0,2)??[])}`).join(',')}`});return;}if(type!=='gpu-submission'&&type!=='application-present')log(type,rest);
   if(type==='probe')report.browser=rest.result;
   if(type==='d3d9-device-created')report.d3d9Device=rest;
   if(type==='application-present'){report.applicationPresents=rest.count;report.submittedFrames=rest.submittedFrames;if(rest.count===1){report.firstPresentObservedMs=performance.now()-report.startTimeMs;report.realmResources??={};report.realmResources.page=resourceMetrics(performance,'page','first Present observed; includes page setup before Start');if(new URL(location.href).searchParams.has('memoryProbe')){report.memoryProbe={status:'pending'};void memoryProbe(performance).then(sample=>{if(report.runId===activeRunId&&worker)report.memoryProbe={...sample,presentsAtCompletion:report.applicationPresents};});}$('status').textContent='Original executable presenting frames';if(!long&&new URL(location.href).searchParams.has('startupTrial')){clearTimeout(timer);timer=setTimeout(()=>stop('startup trial completed after first Present'),100);}else if(!long&&new URL(location.href).searchParams.has('benchmark')){clearTimeout(timer);timer=setTimeout(()=>stop(`${measurementMs/1000}-second frame-delivery measurement completed`),measurementMs);}}if(rest.count===1||rest.count%60===0)$('metrics').textContent=`Application Presents: ${rest.count} · Submitted frames: ${rest.submittedFrames} · Scene correctness: see sampled evidence`;}
   if(type==='gpu-submission')report.gpuSubmissions=rest.count;
   if(type==='identity')report.executableSha256=rest.sha256;
   if(type==='window-created'){report.window=rest;$('scene').style.aspectRatio=`${rest.width}/${rest.height}`}
   if(type==='d3d9-created'){report.direct3DCreate9Reached=true;report.direct3D9ObjectCreated=true;}
   if(type==='failed'&&rest.message.includes('d3d9!Direct3DCreate9'))report.direct3DCreate9Reached=true;
   if(type==='execution-start')report.originalExecutionAttempted=true;
   if(type==='resource-metrics')report.resourceMetrics=rest;
   if(type==='asset-cache-metrics')report.assetCacheMetrics=rest;
   if(rest.wasmLinearMemoryBytes)report.performance.wasmLinearMemoryBytes=rest.wasmLinearMemoryBytes;
   if(type==='failed'){report.blocker=rest.message;const detail=rest.message.replace(/\s+/g,' ').slice(0,1200);stop('failed: '+detail);}
   if(type==='returned')stop('executable returned without verified scene');
   if(type==='gpu-error'||type==='gpu-lost'){report.blocker=rest;stop(type+': '+rest.message)}
  };
  worker.onerror=e=>{report.blocker=e.message;log('worker-error',{message:e.message});stop('failed: '+e.message)};
  const oldCanvas=$('scene');const canvas=oldCanvas.cloneNode();oldCanvas.replaceWith(canvas);
  canvas.tabIndex=0;bindInput(canvas);
  const offscreen=canvas.transferControlToOffscreen();
  const channel=new MessageChannel();gpuWorker=new Worker(new URL(`./gpu-worker.js?guest=${encodeURIComponent(build.guest.id)}&v=${workerVersion}`,import.meta.url),{type:'module'});
  gpuWorker.onmessage=worker.onmessage;gpuWorker.onerror=worker.onerror;
  const drawDiagnosticsParam=new URL(location.href).searchParams.get('drawDiagnostics');
  gpuWorker.postMessage({type:'init',runtimeMode:selectedMode,gpuTiming:new URL(location.href).searchParams.has('gpuTiming'),sceneEquivalenceControl:new URL(location.href).searchParams.get('sceneEquivalenceControl'),sceneEquivalence:new URL(location.href).searchParams.has('sceneEquivalence'),canvas:offscreen,port:channel.port1,startEpoch:performance.timeOrigin+report.startTimeMs,drawDiagnostics:drawDiagnosticsParam===null?0:(/^\d+$/.test(drawDiagnosticsParam)?Math.min(64,Number(drawDiagnosticsParam)):3),captureFrames:new URL(location.href).searchParams.has('captureFrames'),cameraTest:new URL(location.href).searchParams.has('cameraTest')},[offscreen,channel.port1]);
  worker.postMessage({type:'start',guestMemory:new URL(location.href).searchParams.get('guestMemory')==='1',resolution:new URL(location.href).searchParams.get('resolution'),build,assetCache:new URL(location.href).searchParams.get('assetCache')??'warm',benchmark:new URL(location.href).searchParams.has('benchmark'),trace:new URL(location.href).searchParams.get('trace'),gpuPort:channel.port2},[channel.port2]);
  // Single attempts have a watchdog; long sessions are user-started and stoppable.
  timer=setTimeout(()=>stop(long?'session deadline reached':report.applicationPresents?'60-second rendering sample completed':'startup watchdog: no Present within 60 seconds'),long?14400000:new URL(location.href).searchParams.has('benchmark')?120000:60000);
 }catch(e){log('failed',{message:e.message});stop('failed: '+e.message)}
}
$('start').onclick=()=>start();$('long').onclick=()=>start(true);$('stop').onclick=()=>stop();
$('download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.download=`${build?.guest?.id??'directwebgpu'}-${report.runId??'probe'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
document.addEventListener('visibilitychange',()=>log('visibility',{message:document.visibilityState}));
try{
 let response=await fetch('./build-manifest.json',{cache:'no-store'});
 if(response.ok){HAS_BACKEND=false;}else{response=await fetch('/api/build',{cache:'no-store'});if(!response.ok)throw Error('build manifest '+response.status);HAS_BACKEND=true;}
 build=await response.json();if(!Array.isArray(build.files)||!build.dependencies?.executable||!build.guest?.title)throw Error('invalid build manifest');report.build=build;
 $('runtime').textContent=`Runtime: Theseus x86 → WASM · Graphics: ${selectedModeInfo.shaderCompiler} → WebGPU · Mode: ${selectedMode}${selectedModeInfo.deprecated?' (deprecated)':''}`;
 document.title=`${build.guest.title} · DirectWebGPU`;$('title').textContent=`${build.guest.title} binary runtime`;$('start').textContent=`Start ${build.guest.title}`;$('revision').textContent=`Loading ${build.guest.title} runtime…`;
 $('start').disabled=false;$('long').disabled=false;
 const dirty=build.dirty??build.workingTreeDirty;
 $('revision').textContent=`${build.guest.title} · revision ${build.runtimeBuild?.revision??build.revision}${dirty?' (working tree modified)':''} · EXE ${build.dependencies.executable.sha256}`;
 const workerUrl=`./worker.js?guest=${encodeURIComponent(build.guest.id)}`;
 probeWorker=new Worker(new URL(workerUrl,import.meta.url),{type:'module'});
 probeWorker.onmessage=({data})=>{log(data.type,data);if(data.type==='probe'){report.browser=data.result;$('status').textContent=data.result.deviceCreated?'GPU device available. Ready for executable launch.':'GPU unavailable. CPU execution tests remain available.'}};
 probeWorker.onerror=e=>{log('probe-error',{message:e.message});$('status').textContent='GPU probe failed: '+e.message};
 probeWorker.postMessage({type:'probe'});
 if(new URL(location.href).searchParams.has('autostart'))void start();
}catch(e){log('initialization-error',{message:e.message});$('status').textContent=e.message}

function bindInput(canvas){
 const keys={Escape:[1,27],KeyW:[17,87],KeyA:[30,65],KeyS:[31,83],KeyD:[32,68],KeyQ:[16,81],KeyE:[18,69],Space:[57,32],Enter:[28,13],F1:[59,112],F2:[60,113],F3:[61,114],ArrowUp:[72,38,1],ArrowDown:[80,40,1],ArrowLeft:[75,37,1],ArrowRight:[77,39,1],ShiftLeft:[42,160],ShiftRight:[54,161],ControlLeft:[29,162],ControlRight:[29,163,1]};
 const debugInput=new URL(location.href).searchParams.has('debugInput');
 const sendInput=message=>{if(debugInput)log('input',{message:message.join(',')});gpuWorker?.postMessage({type:'input',message})};
 const pressed=new Map();
 for(const type of ['keydown','keyup'])canvas.addEventListener(type,e=>{const k=keys[e.code];if(!k||!worker)return;e.preventDefault();if(type==='keydown'){browserAudio.unlock();pressed.set(e.code,k);}else pressed.delete(e.code);sendInput([type==='keydown'?5:6,k[0],k[1],(k[2]??0)|(e.repeat?2:0)])});
 canvas.addEventListener('blur',()=>{for(const k of pressed.values())sendInput([6,k[0],k[1],k[2]??0]);pressed.clear()});
 for(const type of ['pointerdown','pointerup','pointermove'])canvas.addEventListener(type,e=>{
  if(!worker)return;if(type==='pointerdown'){browserAudio.unlock();canvas.focus();canvas.setPointerCapture(e.pointerId)}const r=canvas.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)*canvas.width/r.width),y=Math.floor((e.clientY-r.top)*canvas.height/r.height);
  const buttons=(e.buttons&1)|((e.buttons&4)>>1)|((e.buttons&2)<<1),changed=type==='pointermove'?0:({0:1,1:2,2:4})[e.button]??0;
  sendInput([type==='pointerdown'?2:type==='pointerup'?3:4,x,y,changed|(buttons<<16)]);
 });
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
}
