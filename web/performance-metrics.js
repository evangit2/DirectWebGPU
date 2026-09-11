// Submission timing, not display scan-out or shader execution timing.
export class PresentationMetrics{
 constructor(startEpoch){this.startEpoch=startEpoch;this.first=null;this.previous=null;this.samples=[];this.rolling=[];this.outliers=[];this.totalIntervals=0;this.totalMs=0;this.completions=[];}
 present(epoch,context={}){
  if(this.first===null)this.first=epoch;
  let sample=null;
  if(this.previous!==null&&this.previous-this.first>=5000){
   const dt=epoch-this.previous;
   if(dt>=0){
    this.totalIntervals++;this.totalMs+=dt;this.samples.push(dt);if(this.samples.length>8192)this.samples.shift();
    this.rolling.push(dt);if(this.rolling.length>600)this.rolling.shift();
    sample={epoch,intervalMs:dt,...context};
    if(dt>=25){this.outliers.push(sample);if(this.outliers.length>128)this.outliers.shift();}
   }
  }
  this.previous=epoch;return sample;
 }
 completeOutlier(present,queueLatencyMs){const sample=[...this.outliers].reverse().find(item=>item.present===present);if(sample)sample.queueLatencyMs=queueLatencyMs;}
 snapshot(){
  const summarize=values=>{const a=[...values].sort((a,b)=>a-b),q=p=>a.length?a[Math.min(a.length-1,Math.ceil(a.length*p)-1)]:null;return{p50:q(.5),p95:q(.95),p99:q(.99),min:a[0]??null,max:a.at(-1)??null};};
  return{firstPresentMs:this.first===null?null:this.first-this.startEpoch,totalSteadyIntervals:this.totalIntervals,steadyDurationMs:this.totalMs,submissionFPS:this.totalMs?this.totalIntervals*1000/this.totalMs:null,frameTimeMs:summarize(this.samples),rollingFrameTimeMs:summarize(this.rolling),rollingIntervals:this.rolling.length,rollingStutterFrames:{over25:this.rolling.filter(dt=>dt>=25).length,over33:this.rolling.filter(dt=>dt>=100/3).length,over50:this.rolling.filter(dt=>dt>=50).length,over100:this.rolling.filter(dt=>dt>=100).length},frameOutliers:this.outliers.map(sample=>({...sample})),retainedIntervals:this.samples.length,warmupMs:5000,queueCompletionSamples:[...this.completions],limitations:'Present submission intervals after 5-second warmup; lifetime percentiles use the last 8192 intervals and rolling metrics use the last 600; queue-completion latency includes queued work and is not GPU shader duration or scan-out.'};
 }
}
