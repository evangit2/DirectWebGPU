// Report only entries the browser exposes in this realm; zero sizes can mean
// unavailable timing data. Do not infer a complete wire-transfer total.
export function resourceMetrics(perf,realm,phase){
 const entries=perf.getEntriesByType('resource'),rows=entries.slice(-256).map(r=>({path:new URL(r.name).pathname,initiatorType:r.initiatorType,startTime:r.startTime,responseEnd:r.responseEnd,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize}));
 return {realm,phase,resourceCount:entries.length,retainedEntries:rows.length,transferSize:entries.reduce((n,r)=>n+r.transferSize,0),encodedBodySize:entries.reduce((n,r)=>n+r.encodedBodySize,0),decodedBodySize:entries.reduce((n,r)=>n+r.decodedBodySize,0),zeroSizeEntries:entries.filter(r=>r.transferSize===0&&r.encodedBodySize===0).length,entries:rows,limitations:'Browser-exposed resource timing only; module dependencies or cached responses may be missing/zero-sized. Realm snapshots are separately scoped, not an exact total of all network bytes.'};
}
export async function memoryProbe(perf,timeoutMs=30000){
 const started=perf.now();if(typeof perf.measureUserAgentSpecificMemory!=='function')return {status:'unavailable',reason:'measureUserAgentSpecificMemory is not exposed'};
 let timeout;
 try{const sample=await Promise.race([perf.measureUserAgentSpecificMemory(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('memory measurement timed out')),timeoutMs);})]);return {status:'measured',elapsedMs:perf.now()-started,bytes:sample.bytes,breakdown:sample.breakdown.slice(0,64),omittedBreakdownEntries:Math.max(0,sample.breakdown.length-64),limitations:'Browser-specific memory estimate, potentially overlapping WASM/shared buffers; do not add it to separate WASM or GPU counters. Measurement can trigger GC and affect performance.'};}catch(e){return {status:'unavailable',elapsedMs:perf.now()-started,reason:String(e)};}finally{clearTimeout(timeout);}
}
