import assert from 'node:assert/strict';
import {PipelineCache} from '../web/d3d9-pipelines.js';

const device={
 pushErrorScope(){},
 async popErrorScope(){return null;},
 createShaderModule({code}){return{code};},
 async createRenderPipelineAsync(descriptor){return{descriptor};},
};
const cache=new PipelineCache(device,null);
const args={
 vertex:0,pixel:0,declaration:new Uint8Array(),streams:[],state:null,
 colorFormat:'bgra8unorm',depthFormat:null,topology:'triangle-list',fixed:true,
 textured:false,viewportSize:[800,600],
 pair:{vertex:{wgsl:'@vertex fn main()->@builtin(position) vec4f{return vec4f();}'},pixel:{wgsl:'@fragment fn main()->@location(0) vec4f{return vec4f(1);}' }},
 layout:[],primitive:{topology:'triangle-list'},target:{format:'bgra8unorm'},depthStencil:undefined,
 alpha:[1,5,0x3f000000],
};
await assert.rejects(cache.compile('missing',args),/alpha-tested pipeline requires a shader translator/);
let alphaCalls=0;
cache.setShaderObjects({translator:{alphaTest(source,func,ref){alphaCalls++;assert.equal(func,5);assert.equal(ref,0x3f000000);return source+'\n// alpha test';}}});
const entry=await cache.compile('ready',args);
assert.equal(alphaCalls,1);
assert.match(entry.pipeline.descriptor.fragment.module.code,/alpha test/);
assert.throws(()=>cache.setShaderObjects({translator:{}}),/cannot be replaced/);
console.log('Fixed-function alpha test lazily attaches the shared shader translator');
