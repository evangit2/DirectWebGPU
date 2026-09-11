const REALTIME_HOST_COMMANDS=new Set([
 'poll_message','wait_message','cursor_warp','cursor_visibility',
 'audio_open','audio_queued','audio_resume','audio_write',
 'music_load','music_command',
]);

/**
 * Keeps D3D commands ordered while allowing independent host services such as
 * audio and cursor updates to remain responsive when GPU completion pauses.
 */
export class GpuCommandScheduler {
 constructor(run,onError=()=>{},onDepth=()=>{}){this.run=run;this.onError=onError;this.onDepth=onDepth;this.pending=0;this.maxPending=0;this.queue=[];this.head=0;this.running=false;this.waiters=[];}
 enqueue(command){
  if(REALTIME_HOST_COMMANDS.has(command?.func)){
   try{Promise.resolve(this.run(command)).catch(this.onError);}catch(error){this.onError(error);}
   return;
  }
  this.pending++;this.maxPending=Math.max(this.maxPending,this.pending);this.onDepth(this.pending,this.maxPending);this.queue.push(command);this.pump();
 }
 complete(){this.pending--;this.onDepth(this.pending,this.maxPending);if(!this.pending){const waiters=this.waiters.splice(0);for(const resolve of waiters)resolve();}}
 pump(){
  if(this.running)return;this.running=true;
  while(this.head<this.queue.length){
   const command=this.queue[this.head++];let pending;
   try{pending=this.run(command);}catch(error){this.onError(error);this.complete();continue;}
   if(pending?.then){Promise.resolve(pending).catch(this.onError).finally(()=>{this.complete();this.running=false;this.compact();this.pump();});return;}
   this.complete();
  }
  this.running=false;this.compact();
 }
 compact(){if(this.head===this.queue.length){this.queue.length=0;this.head=0;}else if(this.head>1024){this.queue=this.queue.slice(this.head);this.head=0;}}
 idle(){return this.pending?new Promise(resolve=>this.waiters.push(resolve)):Promise.resolve();}
}
