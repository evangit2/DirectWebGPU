// D3D9 fixed-function compatibility for common FVF and declaration layouts.
export function fixedFunctionPair(declaration,textured,viewportSize=[1,1]){
 const semantics=new Map();
 for(let p=0;p<declaration.length-8;p+=8){const e=declaration.slice(p,p+8);semantics.set(e[6]+':'+e[7],e[4]);}
 const position=semantics.get('0:0')===2?'xyz':semantics.get('0:0')===3?'xyzw':semantics.get('9:0')===3?'screen':null;
 const hasDiffuse=semantics.get('10:0')===3;
 const hasNormal=semantics.get('3:0')===2;
 const colorInput=hasDiffuse?'diffuse':hasNormal?'normal':null;
 const expected=1+(colorInput?1:0)+(textured?1:0);
 if(!position||semantics.size!==expected||(textured&&semantics.get('5:0')!==1))throw Error('unsupported fixed-function declaration: requires POSITION/XYZRHW plus optional NORMAL, DIFFUSE, and TEX1');
 const inputs=[`@location(0) position:${position==='xyz'?'vec3<f32>':'vec4<f32>'}`];
 if(colorInput)inputs.push(`@location(1) vertexAttr:${hasDiffuse?'vec4<f32>':'vec3<f32>'}`);
 if(textured)inputs.push('@location(2) uv:vec2<f32>');
 const [width,height]=viewportSize.map(v=>Math.max(1,Number(v)||1));
 const positionExpression=position==='screen'
  ? `vec4<f32>(2.0*position.x/${width}.0-1.0,1.0-2.0*position.y/${height}.0,position.z,1.0)`
  : position==='xyzw'
   ? 'transforms.projection*transforms.view*transforms.world*position'
   : 'transforms.projection*transforms.view*transforms.world*vec4<f32>(position,1.0)';
 const io='struct Output { @builtin(position) position:vec4<f32>, @location(0) color:vec4<f32>, @location(1) uv:vec2<f32> };';
 const vertex=[
  'struct Transforms { world:mat4x4<f32>, view:mat4x4<f32>, projection:mat4x4<f32> };',
  '@group(1) @binding(0) var<uniform> transforms:Transforms;',
  io,
  `@vertex fn main(${inputs.join(', ')})->Output {`,
  `var result:Output; result.position=${positionExpression};`,
  `result.color=${hasDiffuse?'clamp(vertexAttr,vec4<f32>(0.0),vec4<f32>(1.0))':'vec4<f32>(1.0)'};`,
  `result.uv=${textured?'uv':'vec2<f32>(0.0)'}; return result;`,
  '}'
 ].join('\n');
 const pixel=[
  io,
  textured?'@group(2) @binding(0) var image:texture_2d<f32>; @group(2) @binding(16) var imageSampler:sampler;':'',
  '@fragment fn main(input:Output)->@location(0) vec4<f32> {',
  textured?'let texel=textureSample(image,imageSampler,input.uv); return vec4<f32>(texel.rgb*input.color.rgb,texel.a);':'return input.color;',
  '}'
 ].join('\n');
 const reflectedInputs=inputs.map((_,location)=>location===0?{usage:position==='screen'?9:0,index:0,location}:colorInput&&location===1?{usage:hasDiffuse?10:3,index:0,location}:{usage:5,index:0,location});
 const uniforms=position==='screen'?[]:[{type:0,index:0,count:12,constant:false}];
 return {fixed:true,vertex:{wgsl:vertex,inputs:reflectedInputs,uniforms,constants:[],samplers:[]},pixel:{wgsl:pixel,uniforms:[],constants:[],samplers:textured?[{group:2,dimension:1,textureBinding:0,samplerBinding:16}]:[]}};
}
