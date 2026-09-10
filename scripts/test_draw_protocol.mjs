import assert from 'node:assert/strict';
import {decodeDraw} from '../web/d3d9-draw.js';
import {fixedFunctionPair} from '../web/fixed-function.js';

const states=[[7,1],[14,1],[15,0],[19,2],[20,1],[22,3],[23,4],[24,0],[25,8],[27,0],[52,0],[53,1],[54,1],[55,1],[56,8],[57,0],[58,0xffffffff],[59,0xffffffff],[168,15],[171,1]];
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1].map(Math.fround).map(value=>new Uint32Array(new Float32Array([value]).buffer)[0]);
const declaration=[0x02000000,0x00000000,0x000000ff,0x00000011];
const textureStages=Array.from({length:8},(_,stage)=>stage===0?[4,2,1,2,2,1,0,0]:[1,0,0,1,0,0,stage,0]).flat();

function packet(compact,clipping=null){
 const packetStates=clipping===null?states:[...states,[136,clipping]];
 const words=[compact?0x32445246:0x39445246,0,0,4,3,0,0,0,2,16,packetStates.length];
 for(let stream=0;stream<16;stream++)words.push(stream===0?1:0,0,stream===0?16:0);
 for(const state of packetStates)words.push(...state);
 words.push(...declaration);
 if(!compact)words.push(...new Array(1312).fill(0));
 words.push(...new Array(16).fill(0),...new Array(16*14).fill(0),...textureStages,0,0,800,600,0,0x3f800000,...identity,...identity,...identity,...new Array(96).fill(0));
 const memory=new SharedArrayBuffer(4096+words.length*4),view=new Uint32Array(memory,4096,words.length);view.set(words);
 return {memory,length:words.length*4};
}

const compact=packet(true),decoded=decodeDraw(compact.memory,4096,compact.length);
assert.equal(compact.length,2228);
assert.equal(decoded.fixed.length,48);assert.equal(decoded.lighting.length,96);assert.equal(decoded.textureStages[0][0],4);
assert.equal(decoded.state.get(136),1);
assert.equal(decoded.registers[0][0][0],0x3f800000);assert(decoded.registers[1].every(words=>words.every(value=>value===0)));
const legacy=packet(false);assert.equal(legacy.length,7476);assert(decodeDraw(legacy.memory,4096,legacy.length).fixed);
const unclipped=packet(true,0),unclippedDecoded=decodeDraw(unclipped.memory,4096,unclipped.length);assert.equal(unclippedDecoded.state.get(136),0);assert.equal(unclipped.length,compact.length+8);
const positionT=new Uint8Array([0,0,0,0,3,0,9,0,0,0,16,0,3,0,10,0,255,0,0,0,17,0,0,0]);
assert.match(fixedFunctionPair(positionT,false,[800,600],null,null,false).vertex.wgsl,/clamp\(position\.z,0\.0,1\.0\)/);
assert.doesNotMatch(fixedFunctionPair(positionT,false,[800,600],null,null,true).vertex.wgsl,/clamp\(position\.z/);
assert.match(fixedFunctionPair(positionT,false,[800,600],null,null,true,false).vertex.wgsl,/,0\.0,1\.0\)/);
assert.doesNotMatch(fixedFunctionPair(positionT,false,[800,600],null,null,true,false).vertex.wgsl,/position\.z,1\.0/);
new Uint32Array(compact.memory,4096,1)[0]=0x39445246;assert.throws(()=>decodeDraw(compact.memory,4096,compact.length),/truncated/);
console.log('Compact fixed-function, clipping state, and legacy full-register draw packets decoded with strict versioning');
