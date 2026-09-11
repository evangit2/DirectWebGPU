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
 constructor(run,onError=()=>{},onDepth=()=>{}){this.run=run;this.onError=onError;this.onDepth=onDepth;this.pending=0;this.maxPending=0;this.chain=Promise.resolve();}
 enqueue(command){
  if(REALTIME_HOST_COMMANDS.has(command?.func)){
   try{Promise.resolve(this.run(command)).catch(this.onError);}catch(error){this.onError(error);}
   return;
  }
  this.pending++;this.maxPending=Math.max(this.maxPending,this.pending);this.onDepth(this.pending,this.maxPending);
  this.chain=this.chain.then(()=>this.run(command)).catch(this.onError).finally(()=>{this.pending--;this.onDepth(this.pending,this.maxPending);});
 }
 idle(){return this.chain;}
}
