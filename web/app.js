import {resourceMetrics,memoryProbe} from './resource-metrics.js';
import {runtimeMode,runtimeModeInfo} from './runtime-mode.js';
import {BrowserTrackerMusic} from './tracker-music.js';
import {bindBrowserInput} from './browser-input.js';
import {audioQueueNeedsReset} from './audio-scheduling.js';
import {attachSharedInputQueue,createSharedInputQueue,pushSharedInput,sharedInputStats} from './input-transport.js';
function boundedPayload(){const copy={...report,events:[...report.events]};let data=JSON.stringify({token,report:copy});while(new TextEncoder().encode(data).length>240000&&copy.events.length){copy.events.shift();copy.droppedEvents++;data=JSON.stringify({token,report:copy})}return data}
const $=id=>document.getElementById(id);
let build,worker,gpuWorker,inputQueue,token,timer,probeWorker,inputBinding,activeRegistryPreset=null,launchGeneration=0,HAS_BACKEND=false;
const selectedMode=runtimeMode(),selectedModeInfo=runtimeModeInfo(selectedMode);
const gameHarness=document.body.dataset.harness==='game';
const coarsePointer=globalThis.matchMedia?.('(pointer: coarse)')?.matches??false;
class BrowserAudio {
 constructor(){this.context=null;this.master=null;this.volume=1;this.sources=new Map();this.streams=new Map();this.pending=[];this.bytes=0;this.buffers=0;this.writesReceived=0;this.droppedPending=0;this.underruns=0;this.queueResets=0;this.clippedSamples=0;this.peak=0;this.maxQueueAheadMs=0;}
 ensure(){
  if(this.context)return this.context;
  const C=globalThis.AudioContext??globalThis.webkitAudioContext;if(!C)return null;
  try{this.context=new C();this.master=this.context.createGain();this.master.gain.value=this.volume;this.master.connect(this.context.destination);}catch(_){return null}return this.context;
 }
 output(){this.ensure();return this.master??this.context?.destination;}
 setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)));if(this.master)this.master.gain.value=this.volume;}
 reset(){for(const source of this.sources.keys()){try{source.stop();}catch(_){}}this.sources.clear();this.streams.clear();this.pending.length=0;}
 open(id,sampleRate,channels){this.ensure();this.streams.set(id,{sampleRate,channels,nextTime:0});}
 async unlock(){const c=this.ensure();if(!c)return false;try{await c.resume();const pending=this.pending.splice(0);for(const item of pending)this.write(item.id,item.data);browserMusic.unlock();audioDiagnostic('audio-unlocked');return c.state==='running';}catch(_){audioDiagnostic('audio-unlock-failed');return false;}}
 write(id,data){
  const c=this.ensure(),s=this.streams.get(id);if(!c||!s)return;
  if(!(data instanceof ArrayBuffer)||data.byteLength<2||data.byteLength%2)return;
  this.writesReceived++;
  if(c.state!=='running'){this.pending.push({id,data});while(this.pending.length>1){this.pending.shift();this.droppedPending++;}return;}
  const sourceBytes=new Int16Array(data),frames=Math.floor(sourceBytes.length/s.channels);if(!frames)return;
  const buffer=c.createBuffer(s.channels,frames,s.sampleRate);
  for(let channel=0;channel<s.channels;channel++){const out=buffer.getChannelData(channel);for(let frame=0;frame<frames;frame++){const sample=sourceBytes[frame*s.channels+channel];out[frame]=sample/32768;this.peak=Math.max(this.peak,Math.abs(sample));if(sample===-32768||sample===32767)this.clippedSamples++;}}
  const now=c.currentTime,coarse=globalThis.matchMedia?.('(pointer: coarse)')?.matches??false;
  if(audioQueueNeedsReset(s.nextTime,now,coarse)){for(const [queued,info] of this.sources){if(info.streamId===id&&info.start>now+.02){try{queued.stop();}catch(_){}}}s.nextTime=now+.04;this.queueResets++;}
  const source=c.createBufferSource();source.buffer=buffer;source.connect(this.output());const start=Math.max(s.nextTime,now+0.06);this.sources.set(source,{streamId:id,start});source.onended=()=>this.sources.delete(source);
  if(s.nextTime&&s.nextTime<now)this.underruns++;
  // Audio messages share the busy page thread with diagnostics and input.
  // Maintain enough lead for ordinary scheduling jitter while keeping effects responsive.
  source.start(start);s.nextTime=start+buffer.duration;
  this.maxQueueAheadMs=Math.max(this.maxQueueAheadMs,(s.nextTime-now)*1000);this.bytes+=data.byteLength;this.buffers++;
 }
}
const browserAudio=new BrowserAudio();
const browserMusic=new BrowserTrackerMusic(()=>browserAudio.ensure(),musicDiagnostic,()=>browserAudio.output());
function audioDiagnostic(type,data={}){
 report.audio={contextState:browserAudio.context?.state??'unavailable',streams:browserAudio.streams.size,writesReceived:browserAudio.writesReceived,bytesScheduled:browserAudio.bytes,buffersScheduled:browserAudio.buffers,pendingChunks:browserAudio.pending.length,droppedPending:browserAudio.droppedPending,underruns:browserAudio.underruns,queueResets:browserAudio.queueResets,clippedSamples:browserAudio.clippedSamples,peak:browserAudio.peak,maxQueueAheadMs:Math.round(browserAudio.maxQueueAheadMs),...data};
 const debug=new URL(location.href).searchParams.has('debugDiagnostics');
 if(debug&&(type!=='audio-write'||browserAudio.writesReceived===1||browserAudio.writesReceived%64===0))log(type,{message:JSON.stringify(report.audio)});
}
function musicDiagnostic(type,data={}){
 const previous=report.music??{},buffers=type==='music-buffer'?(previous.buffers??0)+1:(previous.buffers??0);
 report.music={...previous,state:type,buffers,...data};
 if((type!=='music-buffer'||buffers===1)&&new URL(location.href).searchParams.has('debugDiagnostics'))log(type,{message:JSON.stringify(data)});
}
function benchmarkDuration(){const value=new URL(location.href).searchParams.get('benchmarkSeconds')??'60';if(!/^\d+$/.test(value)||Number(value)<60||Number(value)>600)throw Error('benchmarkSeconds must be an integer from 60 through 600');return Number(value)*1000;}
let report={runId:null,status:'idle',runtime:selectedModeInfo,events:[],droppedEvents:0,applicationPresents:0,submittedFrames:0,sceneFrames:0,performance:{firstSceneMs:'not measured',fps:'not measured',jsHeapBytes:'not measured',gpuBytes:'not measured'}};
globalThis.directWebGPUReport=()=>structuredClone(report);
function log(type,data={}){report.events.push({timeMs:Math.round(performance.now()),type,...data});if(report.events.length>250){report.events.shift();report.droppedEvents++}$('logs').textContent=report.events.map(e=>`${e.timeMs} ${e.type}: ${e.message??JSON.stringify(e.result??e)}`).join('\n');$('logs').scrollTop=$('logs').scrollHeight;}
async function upload(){if(!token)return;try{const r=await fetch('/api/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:boundedPayload()});if(!r.ok)throw Error('evidence upload '+r.status)}catch(e){log('upload-error',{message:e.message})}}
addEventListener('pagehide',()=>{if(!HAS_BACKEND||!token)return;report.endedAt??=new Date().toISOString();navigator.sendBeacon('/api/evidence',new Blob([boundedPayload()],{type:'application/json'}));});
function diagnosticsText(){return JSON.stringify({summary:report.status,location:location.href,report},null,2)}
function downloadDiagnostics(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([diagnosticsText()],{type:'application/json'}));a.download=`${build?.guest?.id??'directwebgpu'}-${report.runId??'probe'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function crashActions(status){const button=$('crash-details');if(!button)return;const crashed=!!report.blocker||/^(failed:|gpu-error:|gpu-lost:|startup watchdog:)/.test(status);button.hidden=!crashed;if(crashed)$('crash-output').textContent=diagnosticsText();}
function stop(status='stopped'){launchGeneration++;clearTimeout(timer);timer=null;inputBinding?.release();inputBinding?.destroy();inputBinding=null;worker?.terminate();worker=null;gpuWorker?.terminate();gpuWorker=null;if(inputQueue)report.inputTransport=sharedInputStats(inputQueue);inputQueue=null;browserMusic.reset();browserAudio.reset();report.status=status;report.endedAt=new Date().toISOString();report.diagnosticAttemptMs=report.startTimeMs?performance.now()-report.startTimeMs:0;$('status').textContent=status;$('start').disabled=false;$('long').disabled=false;$('stop').disabled=true;if($('restart'))$('restart').disabled=false;document.body.classList.remove('running');crashActions(status);void upload()}
async function start(long=false,registryPreset=null){
 if(worker||!build||$('start').disabled)return;
 const generation=++launchGeneration;
 const audioUnlock=browserAudio.unlock();
 $('start').disabled=true;$('long').disabled=true;
 if(!crossOriginIsolated){$('status').textContent='Cross-origin isolation not active yet — reload the page once (the service worker enables it on the second load).';$('start').disabled=false;$('long').disabled=false;return;}
 if(coarsePointer)await Promise.race([audioUnlock,new Promise(resolve=>setTimeout(()=>resolve(false),750))]);
 if(generation!==launchGeneration)return;
 try{
  const params=new URL(location.href).searchParams,measurementMs=params.has('benchmark')?benchmarkDuration():null;
  probeWorker?.terminate();probeWorker=null;
  activeRegistryPreset=registryPreset;report={applicationPresents:0,submittedFrames:0,sceneFrames:0,performance:{firstSceneMs:'not measured',fps:'not measured',jsHeapBytes:'not measured',gpuBytes:'not measured'},runtime:selectedModeInfo,registryPreset,runId:crypto.randomUUID(),status:'starting',events:[],droppedEvents:0,build,startTimeMs:performance.now(),startedAt:new Date().toISOString(),requestedDurationMs:long?14400000:new URL(location.href).searchParams.has('benchmark')?measurementMs:null,visibility:document.visibilityState};
  $('crash-details').hidden=true;$('crash-dialog')?.close();
  if(HAS_BACKEND){const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error('session creation '+response.status);const sessionToken=(await response.json()).token;if(generation!==launchGeneration)return;token=sessionToken;}
  $('start').disabled=true;$('long').disabled=true;$('stop').disabled=false;if($('restart'))$('restart').disabled=false;$('status').textContent=gameHarness?'Starting…':`Executing original ${build.guest.title} binary…`;document.body.classList.add('running');
  // Keep runtime query parameters in the worker URL so a changed runtime mode
  // cannot reuse a browser-cached worker module from another run.
  const workerVersion=encodeURIComponent(`${build.runtimeBuild?.sourceSha256??build.runtimeBuild?.builtAt??build.revision}:${location.search}`);
  worker=new Worker(new URL(`./worker.js?guest=${encodeURIComponent(build.guest.id)}&v=${workerVersion}`,import.meta.url),{type:'module'});
  const activeRunId=report.runId;
  worker.onmessage=({data})=>{
   if(data.type==='input-queue-ready'){inputQueue=attachSharedInputQueue(data.buffer,data.address);report.inputTransportMode='wasm-shared';return;}
   if(data.type==='cursor-warp'){inputBinding?.warp(data.x,data.y);report.cursorWarps=(report.cursorWarps??0)+1;if(report.cursorWarps<=3)(report.cursorWarpSamples??=[]).push({x:data.x,y:data.y,timeMs:performance.now()-report.startTimeMs});return;}
   if(data.type==='cursor-visibility'){inputBinding?.setCursorVisible(data.visible);report.cursorVisible=data.visible;return;}
   if(data.type==='audio-open'){browserAudio.open(data.streamId,data.sampleRate,data.channels);audioDiagnostic('audio-open',{sampleRate:data.sampleRate,channels:data.channels});return;}
   if(data.type==='audio-write'){browserAudio.write(data.streamId,data.data);audioDiagnostic('audio-write');return;}
   if(data.type==='audio-resume'){browserAudio.unlock();audioDiagnostic('audio-resume');return;}
   if(data.type==='music-load'){const bytes=data.data.byteLength;browserMusic.load(data.handle,data.data,data.flags);musicDiagnostic('music-received',{handle:data.handle,bytes,flags:data.flags});return;}
   if(data.type==='music-play'){browserMusic.play(data.handle,data.start,data.flags,data.restart);return;}
   if(data.type==='music-stop'){data.handle?browserMusic.stop(data.handle):browserMusic.stopAll();return;}
   if(data.type==='music-attributes'){browserMusic.attributes(data.handle,data.frequency,data.volume,data.pan);return;}
   if(data.type==='music-free-all'){browserMusic.reset();return;}
   if(!worker||report.runId!==activeRunId)return;
   const {type,...rest}=data;if(type==='performance-sample'){report.presentationMetrics=rest.sample;const elapsedMs=performance.now()-report.startTimeMs;report.stabilitySamples??=[];if(!report.stabilitySamples.length||elapsedMs-report.stabilitySamples.at(-1).elapsedMs>=30000){if(report.stabilitySamples.length<21){const m=rest.sample;report.stabilitySamples.push({elapsedMs,applicationPresents:report.applicationPresents,wasmLinearMemoryBytes:m.wasmLinearMemoryBytes,geometryGPUBytes:m.geometryGPUBytes,textureGPUBytes:m.textureGPUBytes,pipelineCacheEntries:m.pipelineCacheEntries,pipelineCompilations:m.pipelineCompilations,pipelineCacheHits:m.pipelineCacheHits,shaderObjects:m.shaderObjects,submissionFPS:m.submissionFPS});}}if(new URL(location.href).searchParams.has('debugDiagnostics'))log(type,{message:`present=${report.applicationPresents} submissionFPS=${rest.sample.submissionFPS??'n/a'} p95=${rest.sample.frameTimeMs?.p95??'n/a'}ms gpuQueue=${rest.sample.queueCompletionSamples?.at(-1)?.latencyMs?.toFixed?.(1)??'n/a'}ms pipelines=${rest.sample.pipelineCacheEntries??'n/a'}/${rest.sample.pipelineCompilations??'n/a'} hits=${rest.sample.pipelineCacheHits??'n/a'} drawBatches=${rest.sample.drawBridge?.drawBatches??'n/a'} batchedDraws=${rest.sample.drawBridge?.batchedDraws??'n/a'} batchedUploads=${rest.sample.drawBridge?.batchedUploads??'n/a'} sourceWrites=${rest.sample.rendererWrites?(rest.sample.rendererWrites.sourceGeometryWrites+rest.sample.rendererWrites.sourceUniformWrites):'n/a'} queueWrites=${rest.sample.rendererWrites?.queueWriteCalls??'n/a'}`});return;}if(type==='draw-state'){report.drawStateTrace??=[];if(report.drawStateTrace.length<256)report.drawStateTrace.push(rest.sample);if(new URL(location.href).searchParams.has('debugDiagnostics'))log(type,{message:`present=${rest.sample.present} count=${rest.sample.count} textures=${rest.sample.textures?.join(',')??'n/a'} stage0=${rest.sample.textureStages?.[0]?.join(',')??'n/a'} lighting=${rest.sample.lightingHeader?.join(',')??'n/a'} state=${JSON.stringify(rest.sample.state)} texture0=${rest.sample.textureInfo?.[0]?JSON.stringify(rest.sample.textureInfo[0]):'n/a'} declaration=${rest.sample.declaration?.join(',')??'n/a'}`});return;}if(['controlled-input','camera-sample','render-state-sample'].includes(type)){report.inputTest??=[];if(report.inputTest.length<140)report.inputTest.push({type,...rest});return;}if(type==='guest-memory'){report.guestMemory??=[];if(report.guestMemory.length<11)report.guestMemory.push(rest.sample);return;}if(type==='realm-resources'){report.realmResources??={};report.realmResources[rest.sample.realm]=rest.sample;return;}if(type==='gpu-timing'){report.gpuTiming??=[];if(report.gpuTiming.length>=128)report.gpuTiming.shift();report.gpuTiming.push(rest.sample);return;}if(type==='scene-equivalence'){report.sceneEquivalence??=[];if(report.sceneEquivalence.length<3)report.sceneEquivalence.push(rest.sample);return;}if(type==='frame-capture'){report.frameCaptures??=[];if(report.frameCaptures.length<3)report.frameCaptures.push(rest.sample);if(new URL(location.href).searchParams.has('debugDiagnostics'))log(type,{message:`present=${rest.sample.present} nonblack=${rest.sample.sceneRegion?.nonblackPixels??'n/a'}/${rest.sample.sceneRegion?.pixels??'n/a'} mean=${rest.sample.sceneRegion?.meanRgb?.join(',')??'n/a'}`});return;}if(type==='draw-diagnostic'){report.drawDiagnostics??=[];if(report.drawDiagnostics.length<16)report.drawDiagnostics.push(rest.sample);if(new URL(location.href).searchParams.has('debugDiagnostics'))log(type,{message:`fixed=${rest.sample.fixed?1:0} vertex=${rest.sample.vertex} pixel=${rest.sample.pixel} kind=${rest.sample.kind} count=${rest.sample.count} textures=${rest.sample.textures?.join(',')??'n/a'} sampler0=${rest.sample.samplers?.[0]?.join(',')??'n/a'} texture0=${rest.sample.textureInfo?.[0]?JSON.stringify(rest.sample.textureInfo[0]):'n/a'} stage0=${rest.sample.textureStages?.[0]?.join(',')??'n/a'} state=${JSON.stringify(Object.fromEntries(Object.entries(rest.sample.state??{}).filter(([k])=>['7','14','15','19','20','22','23','24','25','27','168','171'].includes(k))))} viewport=${rest.sample.viewport?.join(',')??'n/a'} inputs=${rest.sample.pair?.vertex?.inputs?.map(i=>`${i.usage}:${i.index}@${i.location}`).join(',')??'n/a'} samplers=${rest.sample.pair?.pixel?.samplers?.length??'n/a'} declarationBytes=${rest.sample.declaration?.length??0} geometry=${(rest.sample.geometry??[]).map(g=>`${g.slot}:${g.stride}/${g.bytes.length} first=${g.bytes.slice(0,40).join('.')} verts=${JSON.stringify(g.float32?.slice(0,2)??[])}`).join(',')}`});return;}if(type!=='gpu-submission'&&type!=='application-present')log(type,rest);
   if(type==='probe')report.browser=rest.result;
   if(type==='d3d9-device-created')report.d3d9Device=rest;
   if(type==='application-present'){report.applicationPresents=rest.count;report.submittedFrames=rest.submittedFrames;if(rest.count===1){report.firstPresentObservedMs=performance.now()-report.startTimeMs;report.realmResources??={};report.realmResources.page=resourceMetrics(performance,'page','first Present observed; includes page setup before Start');if(params.has('memoryProbe')){report.memoryProbe={status:'pending'};void memoryProbe(performance).then(sample=>{if(report.runId===activeRunId&&worker)report.memoryProbe={...sample,presentsAtCompletion:report.applicationPresents};});}$('status').textContent='Running';if(!long){clearTimeout(timer);timer=null;}if(!long&&params.has('startupTrial'))timer=setTimeout(()=>stop('startup trial completed after first Present'),100);else if(!long&&params.has('benchmark'))timer=setTimeout(()=>stop(`${measurementMs/1000}-second frame-delivery measurement completed`),measurementMs);}if(rest.count===1||rest.count%60===0){const measured=report.presentationMetrics,rollingP95=measured?.rollingFrameTimeMs?.p95??measured?.frameTimeMs?.p95,stutters=measured?.rollingStutterFrames?.over33,window=measured?.rollingIntervals;$('metrics').textContent=`Application Presents: ${rest.count} · Submitted frames: ${rest.submittedFrames} · rolling p95 ${Number.isFinite(rollingP95)?rollingP95.toFixed(1):'not measured'} ms${Number.isInteger(stutters)?` · >33 ms ${stutters}/${window}`:''}`;}}
   if(type==='gpu-submission')report.gpuSubmissions=rest.count;
   if(type==='identity')report.executableSha256=rest.sha256;
   if(type==='window-created'||type==='window-resized'){report.window=rest;const aspect=rest.width/rest.height;$('scene').style.aspectRatio=`${rest.width}/${rest.height}`;$('stage').style.setProperty('--game-aspect',String(aspect))}
   if(type==='d3d9-created'){report.direct3DCreate9Reached=true;report.direct3D9ObjectCreated=true;}
   if(type==='failed'&&rest.message.includes('d3d9!Direct3DCreate9'))report.direct3DCreate9Reached=true;
   if(type==='execution-start')report.originalExecutionAttempted=true;
   if(type==='resource-metrics')report.resourceMetrics=rest;
   if(type==='asset-cache-metrics')report.assetCacheMetrics=rest;
   if(rest.wasmLinearMemoryBytes)report.performance.wasmLinearMemoryBytes=rest.wasmLinearMemoryBytes;
   if(type==='failed'){report.blocker=rest.message;const detail=rest.message.replace(/\s+/g,' ').slice(0,1200);stop('failed: '+detail);}
   if(type==='returned')stop('executable returned without verified scene');
   if(type==='gpu-error'||type==='gpu-lost'||type==='input-error'){report.blocker=rest;stop(type+': '+rest.message)}
  };
  worker.onerror=e=>{report.blocker=e.message;log('worker-error',{message:e.message});stop('failed: '+e.message)};
  const oldCanvas=$('scene');const canvas=oldCanvas.cloneNode();oldCanvas.replaceWith(canvas);
  const virtualCursor=({x,y,visible})=>{const marker=$('guest-cursor');if(!marker)return;const activeCanvas=$('scene');if(!visible||!activeCanvas){marker.hidden=true;return;}const canvasRect=activeCanvas.getBoundingClientRect(),stageRect=$('stage').getBoundingClientRect();marker.hidden=false;marker.style.transform=`translate(${canvasRect.left-stageRect.left+x*canvasRect.width/activeCanvas.width}px,${canvasRect.top-stageRect.top+y*canvasRect.height/activeCanvas.height}px)`;};
  inputQueue=createSharedInputQueue();canvas.tabIndex=0;inputBinding=bindBrowserInput(canvas,{isRunning:()=>!!worker,send:message=>{if(inputQueue&&!pushSharedInput(inputQueue,message))report.inputTransport=sharedInputStats(inputQueue)},unlock:()=>browserAudio.unlock(),profile:build.guest?.inputProfile??{},touchRoot:$('touch-controls'),onVirtualCursor:virtualCursor,onCursorVisibilityChange:visible=>document.body.classList.toggle('guest-cursor-hidden',!visible),debug:message=>{if(params.has('debugInput'))log('input',{message:message.join(',')})},onCaptureChange:(locked,supported)=>{if($('capture'))$('capture').textContent=locked?'Mouse captured':supported?'Capture mouse':'Focus game';document.body.classList.toggle('mouse-captured',locked);}});
  const offscreen=canvas.transferControlToOffscreen();
  const channel=new MessageChannel();gpuWorker=new Worker(new URL(`./gpu-worker.js?guest=${encodeURIComponent(build.guest.id)}&v=${workerVersion}`,import.meta.url),{type:'module'});
  gpuWorker.onmessage=worker.onmessage;gpuWorker.onerror=worker.onerror;
  const drawDiagnosticsParam=params.get('drawDiagnostics'),drawStateTraceParam=params.get('drawStateTrace');
  const diagnosticAfterPresentParam=params.get('drawDiagnosticsAfterPresent'),diagnosticSkipParam=params.get('drawDiagnosticsSkip');
  gpuWorker.postMessage({type:'init',runtimeMode:selectedMode,gpuTiming:params.has('gpuTiming'),profileStutters:params.has('profileStutters'),frameFenceInterval:/^\d+$/.test(params.get('frameFenceInterval')??'')?Number(params.get('frameFenceInterval')):undefined,sceneEquivalenceControl:params.get('sceneEquivalenceControl'),sceneEquivalence:params.has('sceneEquivalence'),canvas:offscreen,port:channel.port1,startEpoch:performance.timeOrigin+report.startTimeMs,drawDiagnostics:drawDiagnosticsParam===null?0:(/^\d+$/.test(drawDiagnosticsParam)?Math.min(64,Number(drawDiagnosticsParam)):3),diagnosticAfterPresent:diagnosticAfterPresentParam&&/^\d+$/.test(diagnosticAfterPresentParam)?Number(diagnosticAfterPresentParam):0,diagnosticSkip:diagnosticSkipParam&&/^\d+$/.test(diagnosticSkipParam)?Math.min(4096,Number(diagnosticSkipParam)):0,drawStateTrace:drawStateTraceParam&&/^\d+$/.test(drawStateTraceParam)?Math.min(256,Number(drawStateTraceParam)):0,captureFrames:params.has('captureFrames'),cameraTest:params.has('cameraTest')},[offscreen,channel.port1]);
  worker.postMessage({type:'start',guestMemory:new URL(location.href).searchParams.get('guestMemory')==='1',resolution:new URL(location.href).searchParams.get('resolution'),registryPreset,build,assetCache:new URL(location.href).searchParams.get('assetCache')??'warm',benchmark:new URL(location.href).searchParams.has('benchmark'),trace:new URL(location.href).searchParams.get('trace'),gpuPort:channel.port2,inputQueue},[channel.port2]);
  // Ordinary play/test sessions keep running. This only catches startup
  // failures; the first Present clears it. Long sessions keep a 4-hour cap.
  timer=setTimeout(()=>stop(long?'session deadline reached':'startup watchdog: no Present within 60 seconds'),long?14400000:60000);
 }catch(e){if(generation!==launchGeneration)return;log('failed',{message:e.message});stop('failed: '+e.message)}
}
$('start').onclick=()=>start();$('long').onclick=()=>start(true);$('stop').onclick=()=>stop();
$('restart')?.addEventListener('click',()=>{stop('restarting');setTimeout(()=>start(false,activeRegistryPreset),0)});
$('capture')?.addEventListener('click',()=>inputBinding?.capture());
$('fullscreen')?.addEventListener('click',()=>void(document.fullscreenElement?document.exitFullscreen():$('stage')?.requestFullscreen?.()));
document.addEventListener('fullscreenchange',()=>{if($('fullscreen'))$('fullscreen').textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen'});
$('debug-toggle')?.addEventListener('click',()=>{$('debug-panel').open=!$('debug-panel').open});
$('volume')?.addEventListener('input',event=>{browserAudio.setVolume(Number(event.target.value)/100);$('volume-value').textContent=`${event.target.value}%`;browserAudio.unlock()});
$('download').onclick=downloadDiagnostics;
$('crash-details')?.addEventListener('click',()=>{$('crash-output').textContent=diagnosticsText();$('crash-dialog').showModal()});
$('crash-close')?.addEventListener('click',()=>$('crash-dialog').close());
$('crash-download')?.addEventListener('click',downloadDiagnostics);
$('crash-copy')?.addEventListener('click',async()=>{const button=$('crash-copy');try{await navigator.clipboard.writeText(diagnosticsText());button.textContent='Copied';setTimeout(()=>button.textContent='Copy details',1600)}catch(error){$('crash-output').focus();log('copy-error',{message:error.message})}});
document.addEventListener('visibilitychange',()=>log('visibility',{message:document.visibilityState}));
try{
 let response=await fetch('./build-manifest.json',{cache:'no-store'});
 if(response.ok){HAS_BACKEND=false;}else{response=await fetch('/api/build',{cache:'no-store'});if(!response.ok)throw Error('build manifest '+response.status);HAS_BACKEND=true;}
 build=await response.json();if(!Array.isArray(build.files)||!build.dependencies?.executable||!build.guest?.title)throw Error('invalid build manifest');report.build=build;
 if(gameHarness){for(const [name,preset] of Object.entries(build.guest.registryPresets??{})){if(!/^[a-z0-9-]{1,64}$/.test(name)||typeof preset?.label!=='string'||!preset.label||preset.label.length>40||!Array.isArray(preset.values))throw Error('invalid guest registry preset');const button=document.createElement('button');button.type='button';button.textContent=preset.label;button.dataset.registryPreset=name;button.addEventListener('click',()=>{stop(`restarting with ${name}`);setTimeout(()=>start(false,name),0)});$('restart').before(button);}}
 $('runtime').textContent=`Runtime: Theseus x86 → WASM · Graphics: ${selectedModeInfo.shaderCompiler} → WebGPU · Mode: ${selectedMode}${selectedModeInfo.deprecated?' (deprecated)':''}`;
 document.title=`${build.guest.title} · DirectWebGPU`;$('title').textContent=gameHarness?build.guest.title:`${build.guest.title} binary runtime`;$('start').textContent=`Start ${build.guest.title}`;$('revision').textContent=`Loading ${build.guest.title} runtime…`;
 $('start').disabled=false;$('long').disabled=false;
 const dirty=build.dirty??build.workingTreeDirty;
 $('revision').textContent=`${build.guest.title} · revision ${build.runtimeBuild?.revision??build.revision}${dirty?' (working tree modified)':''} · EXE ${build.dependencies.executable.sha256}`;
 if($('play-link'))$('play-link').href=`./${build.guest.id}${location.search}`;
 const workerUrl=`./worker.js?guest=${encodeURIComponent(build.guest.id)}`;
 probeWorker=new Worker(new URL(workerUrl,import.meta.url),{type:'module'});
 probeWorker.onmessage=({data})=>{log(data.type,data);if(data.type==='probe'){report.browser=data.result;$('status').textContent=data.result.deviceCreated?'GPU device available. Ready for executable launch.':'GPU unavailable. CPU execution tests remain available.'}};
 probeWorker.onerror=e=>{log('probe-error',{message:e.message});$('status').textContent='GPU probe failed: '+e.message};
 probeWorker.postMessage({type:'probe'});
 const launchParams=new URL(location.href).searchParams,explicitAutostart=launchParams.has('autostart'),requestedPreset=launchParams.get('registryPreset');
 if(requestedPreset!==null&&!build.guest.registryPresets?.[requestedPreset])throw Error('unknown registry preset');
 if(explicitAutostart||(gameHarness&&!coarsePointer))void start(false,requestedPreset);
 else if(gameHarness)$('status').textContent=`Tap Start ${build.guest.title} to enable audio.`;
}catch(e){log('initialization-error',{message:e.message});$('status').textContent=e.message}
