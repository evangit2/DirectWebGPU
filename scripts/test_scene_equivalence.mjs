import assert from 'node:assert/strict';
import {compareSceneBytes,SceneEquivalence} from '../web/scene-equivalence.js';
const a=new Uint8Array(256*66),b=a.slice();
b[0]=255;assert.equal(compareSceneBytes(a,b,2,66,256).differentPixels,0);
b[64*256]=10;let r=compareSceneBytes(a,b,2,66,256);assert.equal(r.pixels,4);assert.equal(r.differentPixels,1);assert.equal(r.maxChannelError,10);assert.equal(r.meanAbsoluteChannelError,10/12);
b[64*256]=0;b[64*256+3]=255;assert.equal(compareSceneBytes(a,b,2,66,256).differentPixels,0);
let flushes=0;const diagnostic={done:false,renderer:{flush:()=>flushes++}};SceneEquivalence.prototype.flush.call(diagnostic);assert.equal(flushes,1);diagnostic.done=true;SceneEquivalence.prototype.flush.call(diagnostic);assert.equal(flushes,1);
console.log('Scene comparison detects RGB errors, excludes overlay/alpha and honors padded rows');
