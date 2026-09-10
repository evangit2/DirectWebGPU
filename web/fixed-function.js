// D3D8/D3D9 fixed-function compatibility driven by serialized device state.
// This module is application-independent; unsupported stages fail explicitly.
const DEFAULT_STAGE=[4,2,1,2,2,1,0,0];
function argBase(value){return Number(value)&15;}
function colorArg(value,hasTexture){
 const base=argBase(value),source=base===2&&hasTexture?'texel':base===1?'current':base===0?'input.color':null;
 if(!source)throw Error('unsupported fixed-function color argument '+base);
 const result=(value&32)?'vec3<f32>('+source+'.a)':source+'.rgb';
 return(value&16)?'(vec3<f32>(1.0)-('+result+'))':result;
}
function alphaArg(value,hasTexture){
 const base=argBase(value),name=base===2&&hasTexture?'texel.a':base===1?'current.a':base===0?'input.color.a':null;
 if(!name)throw Error('unsupported fixed-function alpha argument '+base);
 return(value&16)?'(1.0-('+name+'))':name;
}
function colorOperation(op,a,b){
 switch(Number(op)){
  case 1:return 'current.rgb';
  case 2:return a;
  case 3:return b;
  case 4:return '('+a+'*'+b+')';
  case 5:return 'clamp(('+a+'*'+b+')*2.0,vec3<f32>(0.0),vec3<f32>(1.0))';
  case 6:return 'clamp(('+a+'*'+b+')*4.0,vec3<f32>(0.0),vec3<f32>(1.0))';
  case 7:return 'min('+a+'+'+b+',vec3<f32>(1.0))';
  case 8:return 'clamp('+a+'+'+b+'-vec3<f32>(0.5),vec3<f32>(0.0),vec3<f32>(1.0))';
  case 9:return 'clamp(('+a+'+'+b+'-vec3<f32>(0.5))*2.0,vec3<f32>(0.0),vec3<f32>(1.0))';
  case 10:return 'max('+a+'-'+b+',vec3<f32>(0.0))';
  case 11:return '('+a+'+'+b+'-'+a+'*'+b+')';
  case 12:return '('+a+'*input.color.a+'+b+'*(1.0-input.color.a))';
  case 13:return '('+a+'*texel.a+'+b+'*(1.0-texel.a))';
  case 15:return '('+a+'+'+b+'*(vec3<f32>(1.0)-texel.a))';
  default:throw Error('unsupported fixed-function color operation '+op);
 }
}
function alphaOperation(op,a,b){
 switch(Number(op)){
  case 1:return 'current.a';
  case 2:return a;
  case 3:return b;
  case 4:return '('+a+'*'+b+')';
  case 5:return 'min(('+a+'*'+b+')*2.0,1.0)';
  case 6:return 'min(('+a+'*'+b+')*4.0,1.0)';
  case 7:return 'min('+a+'+'+b+',1.0)';
  case 8:return 'max('+a+'+'+b+'-0.5,0.0)';
  case 9:return 'clamp(('+a+'+'+b+'-0.5)*2.0,0.0,1.0)';
  case 10:return 'max('+a+'-'+b+',0.0)';
  case 11:return '('+a+'+'+b+'-'+a+'*'+b+')';
  case 12:return '('+a+'*input.color.a+'+b+'*(1.0-input.color.a))';
  case 13:return '('+a+'*texel.a+'+b+'*(1.0-texel.a))';
  case 15:return '('+a+'+'+b+'*(1.0-texel.a))';
  default:throw Error('unsupported fixed-function alpha operation '+op);
 }
}

function lightingStruct(){return '\nstruct Light {\n direction:vec4<f32>,\n diffuse:vec4<f32>,\n ambient:vec4<f32>,\n position:vec4<f32>,\n params:vec4<f32>,\n};\nstruct Lighting {\n header:vec4<f32>,\n materialDiffuse:vec4<f32>,\n materialAmbient:vec4<f32>,\n materialEmissive:vec4<f32>,\n lights:array<Light,4>,\n};';}

export function fixedFunctionPair(declaration,textured,viewportSize=[1,1],textureStages=null,lighting=null,clipTransformed=true,depthEnabled=true){
 const semantics=new Map();
 for(let p=0;p<declaration.length-8;p+=8){const e=declaration.slice(p,p+8);semantics.set(e[6]+':'+e[7],e[4]);}
 const positionType=semantics.get('0:0'),screenType=semantics.get('9:0');
 const position=positionType===2?'xyz':positionType===3?'xyzw':screenType===2||screenType===3?'screen':null;
 const hasDiffuse=semantics.has('10:0')&&[3,4].includes(semantics.get('10:0'));
 const hasNormal=semantics.get('3:0')===2;
 const stage=textureStages?.[0]??DEFAULT_STAGE;
 const requestedCoord=Number(stage[6])&15;
 const coordIndex=semantics.has('5:'+requestedCoord)?requestedCoord:semantics.has('5:0')?0:null;
 const hasTexcoord=coordIndex!==null;
 const texcoordType=hasTexcoord?semantics.get('5:'+coordIndex):undefined;
 const useTexture=Boolean(textured&&hasTexcoord);
 const useLighting=Boolean(lighting&&lighting.length===96&&lighting[0]!==0&&hasNormal&&!hasDiffuse&&position!=='screen');
 if(!position||(!hasDiffuse&&!hasNormal&&semantics.size>1&&!hasTexcoord))throw Error('unsupported fixed-function declaration: requires POSITION/XYZR plus supported color and texture elements');
 const inputs=['@location(0) position:'+(position==='xyz'?'vec3<f32>':position==='screen'&&screenType===2?'vec3<f32>':'vec4<f32>')];
 if(hasDiffuse||hasNormal)inputs.push('@location(1) vertexAttr:'+(hasDiffuse?'vec4<f32>':'vec3<f32>'));
 if(hasTexcoord)inputs.push('@location('+(hasDiffuse||hasNormal?2:1)+') uvInput:'+['f32','vec2<f32>','vec3<f32>','vec4<f32>'][texcoordType]);
 const [width,height]=viewportSize.map(v=>Math.max(1,Number(v)||1));
 // WebGPU always clips Z. Direct3D screen-space UI with depth disabled does
 // not use the supplied Z value for visibility, so keep those vertices in the
 // WebGPU clip volume instead of dropping otherwise valid 2D triangles.
 const screenDepth=!depthEnabled?'0.0':clipTransformed?'position.z':'clamp(position.z,0.0,1.0)';
 const positionExpression=position==='screen'
  ? 'vec4<f32>(2.0*position.x/'+width+'.0-1.0,1.0-2.0*position.y/'+height+'.0,'+screenDepth+',1.0)'
  : position==='xyzw'
   ? 'transforms.projection*transforms.view*transforms.world*position'
   : 'transforms.projection*transforms.view*transforms.world*vec4<f32>(position,1.0)';
 const io='struct Output { @builtin(position) position:vec4<f32>, @location(0) color:vec4<f32>, @location(1) uv:vec2<f32> };';
 const diffuseExpression=hasDiffuse?'clamp('+(semantics.get('10:0')===4?'vertexAttr.zyxw':'vertexAttr')+',vec4<f32>(0.0),vec4<f32>(1.0))':'vec4<f32>(1.0)';
 const lightingFunction=useLighting?[
  'fn computeLighting(normal:vec3<f32>)->vec4<f32>{',
  'var lightColor=transforms.lighting.materialEmissive.rgb+transforms.lighting.materialAmbient.rgb*transforms.lighting.header.yzw;',
  'for(var lightIndex:u32=0u;lightIndex<4u;lightIndex=lightIndex+1u){',
  'let light=transforms.lighting.lights[lightIndex];',
  'if(transforms.lighting.header.x>0.5&&light.params.y>0.5){',
  'let lightDirection=normalize(-light.direction.xyz);',
  'let diffuse=max(dot(normal,lightDirection),0.0);',
  'lightColor=lightColor+transforms.lighting.materialAmbient.rgb*light.ambient.rgb+transforms.lighting.materialDiffuse.rgb*light.diffuse.rgb*diffuse;',
  '}',
  '}',
  'return vec4<f32>(clamp(lightColor,vec3<f32>(0.0),vec3<f32>(1.0)),transforms.lighting.materialDiffuse.a);',
  '}'
 ].join('\n'):'';
 const transformSource=useLighting?lightingStruct():'';
 const vertex=[
  transformSource,
  'struct Transforms { world:mat4x4<f32>, view:mat4x4<f32>, projection:mat4x4<f32>'+(useLighting?', lighting:Lighting':'')+' };',
  lightingFunction,
  '@group(1) @binding(0) var<uniform> transforms:Transforms;',io,
  '@vertex fn main('+inputs.join(', ')+')->Output {',
  'var result:Output; result.position='+positionExpression+';',
  'result.color='+(useLighting?'computeLighting(normalize(vertexAttr))':diffuseExpression)+';',
  'result.uv='+(useTexture?(texcoordType===0?'vec2<f32>(uvInput,0.0)':'uvInput.xy'):'vec2<f32>(0.0)')+'; return result;','}'
 ].join('\n');
 const pixel=[io,useTexture?'@group(2) @binding(0) var image:texture_2d<f32>; @group(2) @binding(16) var imageSampler:sampler;':'',
  '@fragment fn main(input:Output)->@location(0) vec4<f32> {','var current:vec4<f32>=input.color;',
  useTexture?'let texel=textureSample(image,imageSampler,input.uv);':'',
  useTexture?'let stageColor='+colorOperation(stage[0],colorArg(stage[1],true),colorArg(stage[2],true))+'; let stageAlpha='+alphaOperation(stage[3],alphaArg(stage[4],true),alphaArg(stage[5],true))+'; current=vec4<f32>(stageColor,stageAlpha);':'',
  'return current;','}'].join('\n');
 const reflectedInputs=[{usage:position==='screen'?9:0,index:0,location:0}];
 if(hasDiffuse||hasNormal)reflectedInputs.push({usage:hasDiffuse?10:3,index:0,location:1});
 if(hasTexcoord)reflectedInputs.push({usage:5,index:coordIndex,location:hasDiffuse||hasNormal?2:1});
 const uniforms=position==='screen'?[]:[{type:0,index:0,count:useLighting?36:12,constant:false}];
 return {fixed:true,vertex:{wgsl:vertex,inputs:reflectedInputs,uniforms,constants:[],samplers:[]},pixel:{wgsl:pixel,uniforms:[],constants:[],samplers:useTexture?[{group:2,dimension:1,textureBinding:0,samplerBinding:16,sourceIndex:0}]:[]}};
}
