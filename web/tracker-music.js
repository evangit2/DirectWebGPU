/** Streams tracker modules decoded by libopenmpt into the page AudioContext. */
export class BrowserTrackerMusic {
 constructor(contextProvider,onDiagnostic=()=>{}){this.contextProvider=contextProvider;this.onDiagnostic=onDiagnostic;this.decoder=null;this.tracks=new Map();}
 ensureDecoder(){
  if(this.decoder)return this.decoder;
  const worker=new Worker(new URL('./tracker-worker.js',import.meta.url));
  worker.onmessage=({data})=>this.message(data);
  worker.onerror=event=>this.onDiagnostic('music-error',{message:event.message});
  this.decoder=worker;return worker;
 }
 load(id,data,flags){
  if(!(data instanceof ArrayBuffer)||!data.byteLength)return;
  const bytes=data.byteLength;
  this.free(id);
  this.tracks.set(id,{ready:false,active:false,pendingPlay:null,requestPending:false,generation:0,nextTime:0,sources:new Set(),gain:null,panner:null,volume:1,pan:0,frequency:-1});
  this.ensureDecoder().postMessage({type:'load',id,data,flags},[data]);
  this.onDiagnostic('music-loading',{handle:id,bytes});
 }
 play(id,start,flags,restart){
  const track=this.tracks.get(id);if(!track)return;
  track.pendingPlay={start,flags,restart};
  if(track.ready)this.start(id,track);
 }
 start(id,track){
  const request=track.pendingPlay??{start:0,flags:0,restart:false};track.pendingPlay=null;
  this.stopSources(track);track.active=true;track.generation++;track.nextTime=0;
  this.ensureNodes(track);
  this.ensureDecoder().postMessage({type:'play',id,...request});
 }
 ensureNodes(track){
  const context=this.contextProvider();if(!context)return;
  if(!track.gain){track.gain=context.createGain();track.gain.gain.value=track.volume;
   if(context.createStereoPanner){track.panner=context.createStereoPanner();track.panner.pan.value=track.pan;track.gain.connect(track.panner);track.panner.connect(context.destination);}
   else track.gain.connect(context.destination);
  }
 }
 message(data){
  const track=this.tracks.get(data.id);
  if(data.type==='error'){this.onDiagnostic('music-error',{handle:data.id,message:data.message});return;}
  if(!track)return;
  if(data.type==='loaded'){track.ready=true;this.onDiagnostic('music-loaded',{handle:data.id});if(track.pendingPlay)this.start(data.id,track);return;}
  if(data.type==='playing'){this.onDiagnostic('music-playing',{handle:data.id});this.request(data.id,track);return;}
  if(data.type==='ended'){track.active=false;track.requestPending=false;this.onDiagnostic('music-ended',{handle:data.id});return;}
  if(data.type==='pcm'){track.requestPending=false;if(!track.active)return;this.schedule(data.id,track,data);}
 }
 schedule(id,track,data){
  const context=this.contextProvider();if(!context||context.state!=='running'){setTimeout(()=>this.request(id,track),100);return;}
  this.ensureNodes(track);
  const samples=new Int16Array(data.pcm),buffer=context.createBuffer(2,data.frames,data.sampleRate);
  const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
  let peak=0;
  for(let i=0;i<data.frames;i++){const l=samples[i*2],r=samples[i*2+1];left[i]=l/32768;right[i]=r/32768;peak=Math.max(peak,Math.abs(l),Math.abs(r));}
  const source=context.createBufferSource();source.buffer=buffer;
  const rate=track.frequency>0?track.frequency/44100:1;source.playbackRate.value=rate;
  source.connect(track.gain);track.sources.add(source);source.onended=()=>track.sources.delete(source);
  track.nextTime=Math.max(track.nextTime,context.currentTime+0.06);source.start(track.nextTime);track.nextTime+=buffer.duration/rate;
  this.onDiagnostic('music-buffer',{handle:id,frames:data.frames,peak,queuedMs:Math.round((track.nextTime-context.currentTime)*1000)});
  this.request(id,track);
 }
 request(id,track){
  if(!track.active||track.requestPending||!track.ready)return;
  const context=this.contextProvider();if(!context||context.state!=='running'){setTimeout(()=>this.request(id,track),100);return;}
  const ahead=track.nextTime-context.currentTime;
  if(ahead>1.1){setTimeout(()=>this.request(id,track),Math.max(20,(ahead-.8)*1000));return;}
  track.requestPending=true;this.ensureDecoder().postMessage({type:'render',id,frames:32768,sampleRate:context.sampleRate});
 }
 attributes(id,frequency,volume,pan){
  const track=this.tracks.get(id);if(!track)return;
  if(frequency>0)track.frequency=frequency;
  if(volume>=0){track.volume=Math.max(0,Math.min(1,volume/100));if(track.gain)track.gain.gain.value=track.volume;}
  if(pan>=-100){track.pan=Math.max(-1,Math.min(1,pan/100));if(track.panner)track.panner.pan.value=track.pan;}
 }
 stop(id){const track=this.tracks.get(id);if(!track)return;track.active=false;track.requestPending=false;track.generation++;this.stopSources(track);this.decoder?.postMessage({type:'stop',id});}
 stopSources(track){for(const source of track.sources){try{source.stop();}catch(_){}}track.sources.clear();}
 stopAll(){for(const id of this.tracks.keys())this.stop(id);}
 free(id){const track=this.tracks.get(id);if(!track)return;this.stop(id);track.gain?.disconnect();track.panner?.disconnect();this.tracks.delete(id);this.decoder?.postMessage({type:'free',id});}
 reset(){this.stopAll();this.decoder?.terminate();this.decoder=null;this.tracks.clear();}
 unlock(){for(const [id,track] of this.tracks)if(track.active)this.request(id,track);}
}
