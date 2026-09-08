function boundedPayload(){const copy={...report,events:[...report.events]};let data=JSON.stringify({token,report:copy});while(new TextEncoder().encode(data).length>240000&&copy.events.length){copy.events.shift();copy.droppedEvents++;data=JSON.stringify({token,report:copy})}return data}
const $=id=>document.getElementById(id);
let build,worker,gpuWorker,token,timer,probeWorker;
let report={runId:null,status:'idle',events:[],droppedEvents:0,applicationPresents:0,submittedFrames:0,sceneFrames:0,performance:{firstSceneMs:'not measured',fps:'not measured',jsHeapBytes:'not measured',gpuBytes:'not measured'}};
function log(type,data={}){report.events.push({timeMs:Math.round(performance.now()),type,...data});if(report.events.length>250){report.events.shift();report.droppedEvents++}$('logs').textContent=report.events.map(e=>`${e.timeMs} ${e.type}: ${e.message??JSON.stringify(e.result??e)}`).join('\n');$('logs').scrollTop=$('logs').scrollHeight;}
async function upload(){if(!token)return;try{const r=await fetch('/api/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:boundedPayload()});if(!r.ok)throw Error('evidence upload '+r.status)}catch(e){log('upload-error',{message:e.message})}}
function stop(status='stopped'){clearTimeout(timer);worker?.terminate();worker=null;gpuWorker?.terminate();gpuWorker=null;report.status=status;report.endedAt=new Date().toISOString();report.diagnosticAttemptMs=performance.now()-report.startTimeMs;$('status').textContent=status;$('start').disabled=false;$('long').disabled=false;$('stop').disabled=true;void upload()}
async function start(long=false){
 if(worker)return;
 try{
  probeWorker?.terminate();probeWorker=null;
  report={applicationPresents:0,submittedFrames:0,sceneFrames:0,performance:{firstSceneMs:'not measured',fps:'not measured',jsHeapBytes:'not measured',gpuBytes:'not measured'},runId:crypto.randomUUID(),status:'starting',events:[],droppedEvents:0,build,startTimeMs:performance.now(),startedAt:new Date().toISOString(),requestedDurationMs:long?14400000:null,visibility:document.visibilityState};
  const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error('session creation '+response.status);token=(await response.json()).token;
  $('start').disabled=true;$('long').disabled=true;$('stop').disabled=false;$('status').textContent='Executing original Humus binary…';
  worker=new Worker('/worker.js',{type:'module'});
  const activeRunId=report.runId;
  worker.onmessage=({data})=>{
   if(!worker||report.runId!==activeRunId)return;
   const {type,...rest}=data;log(type,rest);
   if(type==='probe')report.browser=rest.result;
   if(type==='d3d9-device-created')report.d3d9Device=rest;
   if(type==='application-present'){report.applicationPresents=rest.count;report.submittedFrames=rest.submittedFrames;}
   if(type==='gpu-submission')report.gpuSubmissions=rest.count;
   if(type==='identity')report.executableSha256=rest.sha256;
   if(type==='window-created'){report.window=rest;$('scene').style.aspectRatio=`${rest.width}/${rest.height}`}
   if(type==='d3d9-created'){report.direct3DCreate9Reached=true;report.direct3D9ObjectCreated=true;}
   if(type==='failed'&&rest.message.includes('d3d9!Direct3DCreate9'))report.direct3DCreate9Reached=true;
   if(type==='execution-start')report.originalExecutionAttempted=true;
   if(rest.wasmLinearMemoryBytes)report.performance.wasmLinearMemoryBytes=rest.wasmLinearMemoryBytes;
   if(type==='failed'){report.blocker=rest.message;stop('failed: '+(rest.message.split('\n').find(line=>line.startsWith('unsupported API:'))??rest.message.split('\n')[0]));}
   if(type==='returned')stop('executable returned without verified scene');
   if(type==='gpu-error'||type==='gpu-lost'){report.blocker=rest;stop(type+': '+rest.message)}
  };
  worker.onerror=e=>{report.blocker=e.message;log('worker-error',{message:e.message});stop('failed: '+e.message)};
  const oldCanvas=$('scene');const canvas=oldCanvas.cloneNode();oldCanvas.replaceWith(canvas);
  const offscreen=canvas.transferControlToOffscreen();
  const channel=new MessageChannel();gpuWorker=new Worker('/gpu-worker.js',{type:'module'});
  gpuWorker.onmessage=worker.onmessage;gpuWorker.onerror=worker.onerror;
  gpuWorker.postMessage({type:'init',canvas:offscreen,port:channel.port1},[offscreen,channel.port1]);
  worker.postMessage({type:'start',build,gpuPort:channel.port2},[channel.port2]);
  // Single attempts have a watchdog; long sessions are user-started and stoppable.
  timer=setTimeout(()=>stop(long?'session deadline reached':'startup watchdog: no completion within 60 seconds'),long?14400000:60000);
 }catch(e){log('failed',{message:e.message});stop('failed: '+e.message)}
}
$('start').onclick=()=>start();$('long').onclick=()=>start(true);$('stop').onclick=()=>stop();
$('download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.download=`humus-${report.runId??'probe'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
document.addEventListener('visibilitychange',()=>log('visibility',{message:document.visibilityState}));
try{
 build=await(await fetch('/api/build')).json();report.build=build;
 $('revision').textContent=`Revision ${build.runtimeBuild?.revision??build.revision}${build.dirty?' (working tree modified)':''} · EXE ${build.dependencies.executable.sha256}`;
 probeWorker=new Worker('/worker.js',{type:'module'});
 probeWorker.onmessage=({data})=>{log(data.type,data);if(data.type==='probe'){report.browser=data.result;$('status').textContent=data.result.deviceCreated?'GPU device available. Ready for executable launch.':'GPU unavailable. CPU execution tests remain available.'}};
 probeWorker.onerror=e=>{log('probe-error',{message:e.message});$('status').textContent='GPU probe failed: '+e.message};
 probeWorker.postMessage({type:'probe'});
}catch(e){log('initialization-error',{message:e.message});$('status').textContent=e.message}
