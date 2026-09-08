import assert from 'node:assert/strict';
import {resourceMetrics,memoryProbe} from '../web/resource-metrics.js';
const entries=Array.from({length:300},(_,i)=>({name:'https://example.test/a?secret='+i,transferSize:i?100:0,encodedBodySize:i?80:0,decodedBodySize:i?160:0}));let r=resourceMetrics({getEntriesByType:()=>entries,now:()=>50,timeOrigin:1000},'test','sample');assert.equal(r.retainedEntries,256);assert.equal(r.transferSize,29900);assert.equal(r.zeroSizeEntries,1);assert.equal(r.entries[0].path,'/a');
assert.equal((await memoryProbe({now:()=>0})).status,'unavailable');assert.equal((await memoryProbe({now:()=>0,measureUserAgentSpecificMemory:async()=>({bytes:10,breakdown:[]})})).bytes,10);assert.equal((await memoryProbe({now:()=>0,measureUserAgentSpecificMemory:()=>new Promise(()=>{})},1)).status,'unavailable');console.log('Realm bounds/sums/zero sizes, stripped queries, memory availability and timeout passed');

const navigation={name:'https://example.test/humus-runtime?private=1',startTime:0,responseEnd:12,transferSize:500,encodedBodySize:200,decodedBodySize:200};
const page=resourceMetrics({getEntriesByType:t=>t==='navigation'?[navigation]:entries,now:()=>50,timeOrigin:1000},'page','first Present');
assert.equal(page.snapshotEpoch,1050);assert.equal(page.navigation.length,1);assert.equal(page.navigation[0].path,'/humus-runtime');assert.equal(page.transferSize,29900);assert.deepEqual(r.navigation,[]);
console.log('Navigation separately scoped and snapshot clock origins passed');
