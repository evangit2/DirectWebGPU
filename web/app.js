import {resourceMetrics,memoryProbe} from './resource-metrics.js';
function boundedPayload(){const copy={...report,events:[...report.events]};let data=JSON.stringify({token,report:copy});while(new TextEncoder().encode(data).length>240000&&copy.events.length){copy.events.shift();copy.droppedEvents++;data=JSON.stringify({token,report:copy})}return data}
const $=id=>document.getElementById(id);
let build,worker,gpuWorker,token,timer,probeWorker;
function benchmarkDuration(){const value=new URL(location.href).searchParams.get('benchmarkSeconds')??'60';if(!/^\d+$/.test(value)||Number(value)<60||Number(value)>600)throw Error('benchmarkSeconds must be an integer from 60 through 600');return Number(value)*1000;}
let report={runId:null,status:'idle',events:[],droppedEvents:0,applicationPresents:0,submittedFrames:0,sceneFrames:0,performance:{firstSceneMs:'not measured',fps:'not measured',jsHeapBytes:'not measured',gpuBytes:'not measured'}};
function log(type,data={}){report.events.push({timeMs:Math.round(performance.now()),type,...data});if(report.events.length>250){report.events.shift();report.droppedEvents++}$('logs').textContent=report.events.map(e=>`${e.timeMs} ${e.type}: ${e.message??JSON.stringify(e.result??e)}`).join('\n');$('logs').scrollTop=$('logs').scrollHeight;}
async function upload(){if(!token)return;try{const r=await fetch('/api/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:boundedPayload()});if(!r.ok)throw Error('evidence upload '+r.status)}catch(e){log('upload-error',{message:e.message})}}
function stop(status='stopped'){clearTimeout(timer);worker?.terminate();worker=null;gpuWorker?.terminate();gpuWorker=null;report.status=status;report.endedAt=new Date().toISOString();report.diagnosticAttemptMs=performance.now()-report.startTimeMs;$('status').textContent=status;$('start').disabled=false;$('stop').disabled=true;void upload()}
// Live static deployment: no evidence backend is available.
const HAS_BACKEND=!!document.querySelector('script[data-evidence]')?.dataset?.evidence;
async function start(){
 if(worker||!build||$('start').disabled)return;
 $('start').disabled=true;
 try{
  const measurementMs=benchmarkDuration();
  probeWorker?.terminate();probeWorker=null;
  report={applicationPresents:0,submittedFrames:0,sceneFrames:0,performance:{firstSceneMs:'not measured',fps:'not measured',jsHeapBytes:'not measured',gpuBytes:'not measured'},runId:crypto.randomUUID(),status:'starting',events:[],droppedEvents:0,build,startTimeMs:performance.now(),startedAt:new Date().toISOString(),requestedDurationMs:new URL(location.href).searchParams.has('benchmark')?measurementMs:null,visibility:document.visibilityState};
  if(HAS_BACKEND){const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error('session creation '+response.status);token=(await response.json()).token;}
  $('stop').disabled=false;$('status').textContent='Executing original Humus binary…';
  worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  const activeRunId=report.runId;
  worker.onmessage=({data})=>{
   if(!worker||report.runId!==activeRunId)return;
   const {type,...rest}=data;if(type==='performance-sample'){report.presentationMetrics=rest.sample;const elapsedMs=performance.now()-report.startTimeMs;report.stabilitySamples??=[];if(!report.stabilitySamples.length||elapsedMs-report.stabilitySamples.at(-1).elapsedMs>=30000){if(report.stabilitySamples.length<21){const m=rest.sample;report.stabilitySamples.push({elapsedMs,applicationPresents:report.applicationPresents,wasmLinearMemoryBytes:m.wasmLinearMemoryBytes,geometryGPUBytes:m.geometryGPUBytes,textureGPUBytes:m.textureGPUBytes,pipelineCacheEntries:m.pipelineCacheEntries,shaderObjects:m.shaderObjects,submissionFPS:m.submissionFPS});}}return;}if(['controlled-input','camera-sample','render-state-sample'].includes(type)){report.inputTest??=[];if(report.inputTest.length<140)report.inputTest.push({type,...rest});return;}if(type==='guest-memory'){report.guestMemory??=[];if(report.guestMemory.length<11)report.guestMemory.push(rest.sample);return;}if(type==='realm-resources'){report.realmResources??={};report.realmResources[rest.sample.realm]=rest.sample;return;}if(type==='gpu-timing'){report.gpuTiming??=[];if(report.gpuTiming.length>=128)report.gpuTiming.shift();report.gpuTiming.push(rest.sample);return;}if(type==='scene-equivalence'){report.sceneEquivalence??=[];if(report.sceneEquivalence.length<3)report.sceneEquivalence.push(rest.sample);return;}if(type==='frame-capture'){report.frameCaptures??=[];if(report.frameCaptures.length<3)report.frameCaptures.push(rest.sample);return;}if(type==='draw-diagnostic'){report.drawDiagnostics??=[];if(report.drawDiagnostics.length<3)report.drawDiagnostics.push(rest.sample);return;}if(type!=='gpu-submission'&&type!=='application-present')log(type,rest);
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
   if(type==='failed'){report.blocker=rest.message;stop('failed: '+(rest.message.split('\n').find(line=>line.startsWith('unsupported API:'))??rest.message.split('\n')[0]));}
   if(type==='returned')stop('executable returned without verified scene');
   if(type==='gpu-error'||type==='gpu-lost'){report.blocker=rest;stop(type+': '+rest.message)}
  };
  worker.onerror=e=>{report.blocker=e.message;log('worker-error',{message:e.message});stop('failed: '+e.message)};
  const oldCanvas=$('scene');const canvas=oldCanvas.cloneNode();oldCanvas.replaceWith(canvas);
  canvas.tabIndex=0;bindInput(canvas);
  const offscreen=canvas.transferControlToOffscreen();
  const channel=new MessageChannel();gpuWorker=new Worker(new URL('./gpu-worker.js',import.meta.url),{type:'module'});
  gpuWorker.onmessage=worker.onmessage;gpuWorker.onerror=worker.onerror;
  gpuWorker.postMessage({type:'init',gpuTiming:new URL(location.href).searchParams.has('gpuTiming'),sceneEquivalenceControl:new URL(location.href).searchParams.get('sceneEquivalenceControl'),sceneEquivalence:new URL(location.href).searchParams.has('sceneEquivalence'),canvas:offscreen,port:channel.port1,startEpoch:performance.timeOrigin+report.startTimeMs,drawDiagnostics:new URL(location.href).searchParams.has('drawDiagnostics'),captureFrames:new URL(location.href).searchParams.has('captureFrames'),cameraTest:new URL(location.href).searchParams.has('cameraTest')},[offscreen,channel.port1]);
  worker.postMessage({type:'start',guestMemory:new URL(location.href).searchParams.get('guestMemory')==='1',resolution:new URL(location.href).searchParams.get('resolution'),build,assetCache:new URL(location.href).searchParams.get('assetCache')??'warm',benchmark:new URL(location.href).searchParams.has('benchmark'),gpuPort:channel.port2},[channel.port2]);
  timer=setTimeout(()=>stop('startup watchdog: no completion within 60 seconds'),new URL(location.href).searchParams.has('benchmark')?120000:60000);
 }catch(e){log('failed',{message:e.message});stop('failed: '+e.message)}
}
$('start').onclick=()=>start();$('stop').onclick=()=>stop();
$('download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.download=`humus-${report.runId??'probe'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
document.addEventListener('visibilitychange',()=>log('visibility',{message:document.visibilityState}));
try{
 // Static deployment: build manifest is a sibling file (no /api/build backend).
 const response=await fetch('./build-manifest.json');if(!response.ok)throw Error('build manifest '+response.status);
 build=await response.json();if(!Array.isArray(build.files)||!build.dependencies?.executable)throw Error('invalid build manifest');report.build=build;
 $('start').disabled=false;
 $('revision').textContent=`Revision ${build.runtimeBuild?.revision??build.revision}${build.dirty?' (working tree modified)':''} · EXE ${build.dependencies.executable.sha256}`;
 probeWorker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
 probeWorker.onmessage=({data})=>{log(data.type,data);if(data.type==='probe'){report.browser=data.result;$('status').textContent=data.result.deviceCreated?'GPU device available. Ready for executable launch.':'GPU unavailable. CPU execution tests remain available.'}};
 probeWorker.onerror=e=>{log('probe-error',{message:e.message});$('status').textContent='GPU probe failed: '+e.message};
 probeWorker.postMessage({type:'probe'});
}catch(e){log('initialization-error',{message:e.message});$('status').textContent=e.message}

function bindInput(canvas){
 const keys={Escape:[1,27],KeyW:[17,87],KeyA:[30,65],KeyS:[31,83],KeyD:[32,68],KeyQ:[16,81],KeyE:[18,69],Space:[57,32],Enter:[28,13],F1:[59,112],F2:[60,113],F3:[61,114],ArrowUp:[72,38,1],ArrowDown:[80,40,1],ArrowLeft:[75,37,1],ArrowRight:[77,39,1],ShiftLeft:[42,160],ShiftRight:[54,161],ControlLeft:[29,162],ControlRight:[29,163,1]};
 const pressed=new Map();
 for(const type of ['keydown','keyup'])canvas.addEventListener(type,e=>{const k=keys[e.code];if(!k||!worker)return;e.preventDefault();if(type==='keydown')pressed.set(e.code,k);else pressed.delete(e.code);gpuWorker?.postMessage({type:'input',message:[type==='keydown'?5:6,k[0],k[1],(k[2]??0)|(e.repeat?2:0)]})});
 canvas.addEventListener('blur',()=>{for(const k of pressed.values())gpuWorker?.postMessage({type:'input',message:[6,k[0],k[1],k[2]??0]});pressed.clear()});
 for(const type of ['pointerdown','pointerup','pointermove'])canvas.addEventListener(type,e=>{
  if(!worker)return;if(type==='pointerdown'){canvas.focus();canvas.setPointerCapture(e.pointerId)}const r=canvas.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)*canvas.width/r.width),y=Math.floor((e.clientY-r.top)*canvas.height/r.height);
  const buttons=(e.buttons&1)|((e.buttons&4)>>1)|((e.buttons&2)<<1),changed=type==='pointermove'?0:({0:1,1:2,2:4})[e.button]??0;
  gpuWorker?.postMessage({type:'input',message:[type==='pointerdown'?2:type==='pointerup'?3:4,x,y,changed|(buttons<<16)]});
 });
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
}
