// D3D9 fixed-function compatibility for common FVF and declaration layouts.
// A declaration describes the vertex buffer. Texture binding is independent
// state, so a TEXCOORD element must remain part of the vertex interface even
// when the current texture stage is unbound.
export function fixedFunctionPair(declaration,textured,viewportSize=[1,1]){
 const semantics=new Map();
 for(let p=0;p<declaration.length-8;p+=8){const e=declaration.slice(p,p+8);semantics.set(e[6]+':'+e[7],e[4]);}
 const positionType=semantics.get('0:0'),screenType=semantics.get('9:0');
 const position=positionType===2?'xyz':positionType===3?'xyzw':screenType===2||screenType===3?'screen':null;
 const hasDiffuse=semantics.has('10:0')&&[3,4].includes(semantics.get('10:0'));
 const hasNormal=semantics.get('3:0')===2;
 const hasTexcoord=semantics.has('5:0');
 const texcoordType=semantics.get('5:0');
 const useTexture=Boolean(textured&&hasTexcoord);
 if(!position||semantics.get('5:0')!==undefined&&!([0,1,2,3].includes(semantics.get('5:0')))||(!hasDiffuse&&!hasNormal&&semantics.size>1&&!hasTexcoord))throw Error('unsupported fixed-function declaration: requires POSITION/XYZRHW plus supported color and texture elements');
 const inputs=[`@location(0) position:${position==='xyz'?'vec3<f32>':position==='screen'&&screenType===2?'vec3<f32>':'vec4<f32>'}`];
 if(hasDiffuse||hasNormal)inputs.push(`@location(1) vertexAttr:${hasDiffuse?'vec4<f32>':'vec3<f32>'}`);
 if(hasTexcoord)inputs.push(`@location(${hasDiffuse||hasNormal?2:1}) uvInput:${['f32','vec2<f32>','vec3<f32>','vec4<f32>'][semantics.get('5:0')]}`);
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
  `result.uv=${useTexture?(texcoordType===0?'vec2<f32>(uvInput,0.0)':'uvInput.xy'):'vec2<f32>(0.0)'}; return result;`,
  '}'
 ].join('\n');
 const pixel=[
  io,
  useTexture?'@group(2) @binding(0) var image:texture_2d<f32>; @group(2) @binding(16) var imageSampler:sampler;':'',
  '@fragment fn main(input:Output)->@location(0) vec4<f32> {',
  useTexture?'let texel=textureSample(image,imageSampler,input.uv); return vec4<f32>(texel.rgb*input.color.rgb,texel.a);':'return input.color;',
  '}'
 ].join('\n');
 const reflectedInputs=[{usage:position==='screen'?9:0,index:0,location:0}];
 if(hasDiffuse||hasNormal)reflectedInputs.push({usage:hasDiffuse?10:3,index:0,location:1});
 if(hasTexcoord)reflectedInputs.push({usage:5,index:0,location:hasDiffuse||hasNormal?2:1});
 const uniforms=position==='screen'?[]:[{type:0,index:0,count:12,constant:false}];
 return {fixed:true,vertex:{wgsl:vertex,inputs:reflectedInputs,uniforms,constants:[],samplers:[]},pixel:{wgsl:pixel,uniforms:[],constants:[],samplers:useTexture?[{group:2,dimension:1,textureBinding:0,samplerBinding:16}]:[]}};
}
