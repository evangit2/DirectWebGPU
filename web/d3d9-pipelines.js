import {fixedFunctionPair} from './fixed-function.js';
import {vertexLayout,vertexWidths} from './vertex-layout.js';
import {RS} from './d3d9-state.js';
const PIPELINE_STATES=[7,14,15,19,20,22,23,24,25,27,52,53,54,55,56,58,59,136,168,171];
const mix=(hash,value)=>Math.imul(hash^(value>>>0),16777619)>>>0;
function mixArray(hash,values){hash=mix(hash,values?.length??0);if(values)for(const value of values)hash=mix(hash,value);return hash;}
function mixString(hash,value){hash=mix(hash,value?.length??0);if(value)for(let i=0;i<value.length;i++)hash=mix(hash,value.charCodeAt(i));return hash;}
function pipelineHash(vertex,pixel,declaration,streams,state,{colorFormat,depthFormat,topology,fixed,textured,textureDimension,textureStages,lighting,viewportSize}){
 let hash=2166136261;for(const value of [vertex,pixel,fixed?1:0,textured?1:0,textureDimension,lighting&&lighting[0]!==0?1:0])hash=mix(hash,value);
 hash=mixArray(hash,declaration);hash=mix(hash,streams.length);for(const stream of streams)hash=mix(hash,stream.stride);
 hash=mix(hash,textureStages?.length??0);if(textureStages)for(const stage of textureStages)hash=mixArray(hash,stage);
 for(const type of PIPELINE_STATES)hash=mix(hash,state.get(type));hash=mixArray(hash,viewportSize);hash=mixString(hash,topology);hash=mixString(hash,colorFormat);return mixString(hash,depthFormat??'');
}
const equalArray=(left,right)=>left.length===right.length&&left.every((value,index)=>value===right[index]);
const equalStages=(left,right)=>left.length===right.length&&left.every((stage,index)=>equalArray(stage,right[index]));
function pipelineSignature(vertex,pixel,declaration,streams,state,options){return{vertex,pixel,fixed:options.fixed,textured:options.textured,textureDimension:options.textureDimension,lighting:!!options.lighting&&options.lighting[0]!==0,declaration:declaration.slice(),strides:Uint32Array.from(streams,stream=>stream.stride),textureStages:options.textureStages?.map(stage=>stage.slice())??null,states:Uint32Array.from(PIPELINE_STATES,type=>state.get(type)),viewportSize:options.viewportSize?Uint32Array.from(options.viewportSize):null,topology:options.topology,colorFormat:options.colorFormat,depthFormat:options.depthFormat};}
function signatureMatches(signature,vertex,pixel,declaration,streams,state,options){
 if(signature.vertex!==vertex||signature.pixel!==pixel||signature.fixed!==options.fixed||signature.textured!==options.textured||signature.textureDimension!==options.textureDimension||signature.lighting!==(!!options.lighting&&options.lighting[0]!==0)||signature.topology!==options.topology||signature.colorFormat!==options.colorFormat||signature.depthFormat!==options.depthFormat||!equalArray(signature.declaration,declaration)||signature.strides.length!==streams.length)return false;
 for(let i=0;i<streams.length;i++)if(signature.strides[i]!==streams[i].stride)return false;
 if(Boolean(signature.textureStages)!==Boolean(options.textureStages)||signature.textureStages&&!equalStages(signature.textureStages,options.textureStages))return false;
 if(Boolean(signature.viewportSize)!==Boolean(options.viewportSize)||signature.viewportSize&&!equalArray(signature.viewportSize,options.viewportSize))return false;
 return PIPELINE_STATES.every((type,index)=>signature.states[index]===state.get(type));
}
// Called by the serial graphics queue. Cache keys exclude dynamic stencil refs,
// resources and constants, which do not change the render pipeline itself.
export class PipelineCache{
 constructor(device,objects){this.device=device;this.objects=objects;this.items=new Map();this.fastItems=new Map();this.fastByKey=new Map();this.bytes=0;this.compilations=0;this.hits=0;}
 setShaderObjects(objects){
  if(!objects?.translator)throw TypeError('shader objects require a translator');
  if(this.objects&&this.objects!==objects)throw Error('pipeline cache shader objects cannot be replaced');
  this.objects=objects;
 }
 get(vertex,pixel,declaration,streams,state,{colorFormat='bgra8unorm',depthFormat='depth24plus-stencil8',topology='triangle-list',fixed=false,textured=false,textureDimension=1,textureStages=null,lighting=null,viewportSize=null}={}){
  if(!fixed){this.objects.get(vertex,0);this.objects.get(pixel,1);}else if(vertex!==0||pixel!==0)throw Error("invalid fixed shader handles");
  if(!['rgba8unorm','bgra8unorm'].includes(colorFormat)||![null,'depth24plus-stencil8'].includes(depthFormat)||!['triangle-list','line-list','point-list'].includes(topology))throw RangeError('unsupported pipeline attachment or topology');
  if(![1,3].includes(textureDimension))throw RangeError('unsupported texture dimension');
  const options={colorFormat,depthFormat,topology,fixed,textured,textureDimension,textureStages,lighting,viewportSize},hash=pipelineHash(vertex,pixel,declaration,streams,state,options);
  for(const record of this.fastItems.get(hash)??[])if(signatureMatches(record.signature,vertex,pixel,declaration,streams,state,options)){const entry=this.items.get(record.key);if(entry){this.items.delete(record.key);this.items.set(record.key,entry);this.hits++;return entry;}}
  // Full serialization and owned signatures are only needed on a cache miss.
  // The common hit path above performs no temporary array or string allocation.
  const pipelineStates=PIPELINE_STATES.map(type=>state.get(type)),key=JSON.stringify([vertex,pixel,fixed,textured,textureDimension,!!lighting&&lighting[0]!==0,textureStages,declaration,streams.map(stream=>stream.stride),topology,colorFormat,depthFormat,pipelineStates,viewportSize]),signature=pipelineSignature(vertex,pixel,declaration,streams,state,options);
  const compiled=this.compile(key,{vertex,pixel,declaration,streams,state,colorFormat,depthFormat,topology,fixed,textured,textureDimension,textureStages,lighting,viewportSize});
  return compiled.then(entry=>{const record={key,signature};let bucket=this.fastItems.get(hash);if(!bucket)this.fastItems.set(hash,bucket=[]);bucket.push(record);this.fastByKey.set(key,[hash,record]);return entry;});
 }
 async compile(key,{vertex,pixel,declaration,streams,state,colorFormat,depthFormat,topology,fixed,textured,textureDimension,textureStages,lighting,viewportSize,pair=null,layout=null,primitive=null,target=null,depthStencil=undefined,alpha=null}){
  if(!pair){const clipTransformed=state.get(RS.CLIPPING)!==0,depthEnabled=state.get(RS.ZENABLE)!==0;pair=fixed?fixedFunctionPair(declaration,textured,viewportSize,textureStages,lighting,clipTransformed,depthEnabled,textureDimension):this.objects.pair(vertex,pixel,declaration);layout=vertexLayout(declaration,pair.vertex.inputs,streams);primitive=state.primitive(topology);target=state.colorTarget(colorFormat);depthStencil=depthFormat?state.depthStencil(depthFormat):undefined;alpha=[state.get(15),state.get(25),state.get(24)];if(!alpha[0])alpha[1]=alpha[2]=0;}
 const translator=this.objects?.translator;
 if(!fixed&&!translator)throw Error('programmable pipeline requires a shader translator');
 if(alpha[0]&&!translator)throw Error('alpha-tested pipeline requires a shader translator');
 const expanded=fixed?pair.vertex.wgsl:translator.vertexInputs(pair.vertex.wgsl,vertexWidths(layout));
 const vertexSource=fixed?expanded:viewportSize?translator.vertexPosition(expanded,...viewportSize):expanded;
  const pixelSource=alpha[0]?translator.alphaTest(pair.pixel.wgsl,alpha[1],alpha[2]):pair.pixel.wgsl;
  const bytes=(vertexSource.length+pixelSource.length)*2;
  if(bytes>16*1024*1024)throw RangeError('pipeline shader source budget exceeded');
  const d=this.device;d.pushErrorScope('validation');let pipeline;
  try{pipeline=await d.createRenderPipelineAsync({layout:'auto',vertex:{module:d.createShaderModule({code:vertexSource}),entryPoint:'main',buffers:layout.map(({stream,...descriptor})=>descriptor)},fragment:{module:d.createShaderModule({code:pixelSource}),entryPoint:'main',targets:[target]},primitive,...(depthStencil?{depthStencil}:{})});}
  finally{const error=await d.popErrorScope();if(error)throw Error(error.message)}
  while(this.items.size>=128||this.bytes+bytes>16*1024*1024){const oldest=this.items.keys().next().value,fast=this.fastByKey.get(oldest);if(fast){const [hash,record]=fast,bucket=this.fastItems.get(hash),index=bucket.indexOf(record);if(index>=0)bucket.splice(index,1);if(!bucket.length)this.fastItems.delete(hash);this.fastByKey.delete(oldest);}this.bytes-=this.items.get(oldest).bytes;this.items.delete(oldest);}
  const entry={pipeline,layout,shaders:pair,bytes};this.items.set(key,entry);this.bytes+=bytes;this.compilations++;return entry;
 }
 dispose(){this.items.clear();this.fastItems.clear();this.fastByKey.clear();this.bytes=0;}
}
