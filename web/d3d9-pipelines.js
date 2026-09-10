import {fixedFunctionPair} from './fixed-function.js';
import {vertexLayout,vertexWidths} from './vertex-layout.js';
import {RS} from './d3d9-state.js';
// Called by the serial graphics queue. Cache keys exclude dynamic stencil refs,
// resources and constants, which do not change the render pipeline itself.
export class PipelineCache{
 constructor(device,objects){this.device=device;this.objects=objects;this.items=new Map();this.bytes=0;this.compilations=0;}
 get(vertex,pixel,declaration,streams,state,{colorFormat='bgra8unorm',depthFormat='depth24plus-stencil8',topology='triangle-list',fixed=false,textured=false,textureStages=null,lighting=null,viewportSize=null}={}){
  if(!fixed){this.objects.get(vertex,0);this.objects.get(pixel,1);}else if(vertex!==0||pixel!==0)throw Error("invalid fixed shader handles");
  if(!['rgba8unorm','bgra8unorm'].includes(colorFormat)||![null,'depth24plus-stencil8'].includes(depthFormat)||!['triangle-list','line-list','point-list'].includes(topology))throw RangeError('unsupported pipeline attachment or topology');
 const clipTransformed=state.get(RS.CLIPPING)!==0,depthEnabled=state.get(RS.ZENABLE)!==0,pair=fixed?fixedFunctionPair(declaration,textured,viewportSize,textureStages,lighting,clipTransformed,depthEnabled):this.objects.pair(vertex,pixel,declaration),layout=vertexLayout(declaration,pair.vertex.inputs,streams);
  const primitive=state.primitive(topology),target=state.colorTarget(colorFormat),depthStencil=depthFormat?state.depthStencil(depthFormat):undefined;
  const alpha=[state.get(15),state.get(25),state.get(24)];if(!alpha[0])alpha[1]=alpha[2]=0;
  const key=JSON.stringify([vertex,pixel,fixed,textured,!!lighting&&lighting[0]!==0,textureStages,layout,primitive,target,depthStencil,alpha,viewportSize,clipTransformed,depthEnabled]);
  let entry=this.items.get(key);if(entry){this.items.delete(key);this.items.set(key,entry);return entry;}
 return this.compile(key,{vertex,pixel,declaration,streams,state,colorFormat,depthFormat,topology,fixed,textured,textureStages,lighting,viewportSize,pair,layout,primitive,target,depthStencil,alpha});
 }
 async compile(key,{vertex,pixel,declaration,streams,state,colorFormat,depthFormat,topology,fixed,textured,viewportSize,pair,layout,primitive,target,depthStencil,alpha}){
 const translator=this.objects?.translator;
 const expanded=fixed?pair.vertex.wgsl:translator.vertexInputs(pair.vertex.wgsl,vertexWidths(layout));
 const vertexSource=fixed?expanded:viewportSize?translator.vertexPosition(expanded,...viewportSize):expanded;
  const pixelSource=alpha[0]?translator.alphaTest(pair.pixel.wgsl,alpha[1],alpha[2]):pair.pixel.wgsl;
  const bytes=(vertexSource.length+pixelSource.length)*2;
  if(bytes>16*1024*1024)throw RangeError('pipeline shader source budget exceeded');
  const d=this.device;d.pushErrorScope('validation');let pipeline;
  try{pipeline=await d.createRenderPipelineAsync({layout:'auto',vertex:{module:d.createShaderModule({code:vertexSource}),entryPoint:'main',buffers:layout.map(({stream,...descriptor})=>descriptor)},fragment:{module:d.createShaderModule({code:pixelSource}),entryPoint:'main',targets:[target]},primitive,...(depthStencil?{depthStencil}:{})});}
  finally{const error=await d.popErrorScope();if(error)throw Error(error.message)}
  while(this.items.size>=128||this.bytes+bytes>16*1024*1024){const oldest=this.items.keys().next().value;this.bytes-=this.items.get(oldest).bytes;this.items.delete(oldest);}
  const entry={pipeline,layout,shaders:pair,bytes};this.items.set(key,entry);this.bytes+=bytes;this.compilations++;return entry;
 }
 dispose(){this.items.clear();this.bytes=0;}
}
