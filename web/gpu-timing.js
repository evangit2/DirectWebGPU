// Opt-in timestamp readback, once per 60 Presents, bounded to 128 draw passes.
export function summarizeTimestamps(words,count){
 if(count<1||count>128||words.length<count*2)throw Error('invalid GPU timestamp sample');
 const durations=[];for(let i=0;i<count;i++){const delta=words[i*2+1]-words[i*2];if(delta<0n||delta>10000000000n)throw Error('invalid GPU timestamp interval');durations.push(Number(delta)/1e6);}
 return {drawPasses:count,sumDrawPassMs:durations.reduce((a,b)=>a+b,0),minDrawPassMs:Math.min(...durations),maxDrawPassMs:Math.max(...durations),zeroDurationPasses:durations.filter(x=>x===0).length};
}
export class GpuTiming {
 constructor(device){this.device=device;this.count=0;this.cpuWallMs=0;this.query=device.createQuerySet({type:'timestamp',count:256});this.resolve=device.createBuffer({size:2048,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});this.read=device.createBuffer({size:2048,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});}
 begin(present){if(present!==1&&present%60!==0)return undefined;if(this.count>=128)throw Error('GPU timing pass capacity exceeded');const index=this.count++*2;return{querySet:this.query,beginningOfPassWriteIndex:index,endOfPassWriteIndex:index+1};}
 async finish(present){if(!this.count)return null;const count=this.count,cpuWallMs=this.cpuWallMs;this.count=0;this.cpuWallMs=0;const e=this.device.createCommandEncoder();e.resolveQuerySet(this.query,0,count*2,this.resolve,0);e.copyBufferToBuffer(this.resolve,0,this.read,0,count*16);this.device.queue.submit([e.finish()]);await this.read.mapAsync(GPUMapMode.READ);
  try{return {present,...summarizeTimestamps(new BigUint64Array(this.read.getMappedRange()),count),hostDrawEncodeWallMs:cpuWallMs,scope:'Sum of GPU draw-render-pass durations only; excludes clears, uploads, gaps between passes and Present copy. Host encoding is wall time including awaited pipeline creation, not CPU busy time. Timestamp precision is browser-dependent; zero durations may reflect quantization.'};}finally{this.read.unmap();}
 }
 dispose(){this.query.destroy();this.resolve.destroy();this.read.destroy();}
}
