// D3D9 unlit fixed-function subset. Texture-stage setters still reject unsupported
// operations in the frontend, so this implements the documented default stage.
export function fixedFunctionPair(declaration,textured){
 const semantics=new Map();for(let p=0;p<declaration.length-8;p+=8){const e=declaration.slice(p,p+8);semantics.set(e[6]+':'+e[7],e[4]);}
 if(semantics.get('0:0')!==2||semantics.get('10:0')!==3||semantics.size!==(textured?3:2)+(semantics.has('5:0')&&!textured?1:0)||textured&&semantics.get('5:0')!==1)throw Error('unsupported fixed-function declaration: requires XYZ, float diffuse and optional TEX2');
 const inputs=[{usage:0,index:0,location:0},{usage:10,index:0,location:1}];if(textured)inputs.push({usage:5,index:0,location:2});
 const io='struct Output { @builtin(position) position:vec4<f32>, @location(0) color:vec4<f32>, @location(1) uv:vec2<f32> };';
 const vertex=`struct Transforms { world:mat4x4<f32>, view:mat4x4<f32>, projection:mat4x4<f32> };
 @group(1) @binding(0) var<uniform> transforms:Transforms;
 ${io}
 @vertex fn main(@location(0) position:vec3<f32>, @location(1) color:vec4<f32>${textured?', @location(2) uv:vec2<f32>':''})->Output {
 var result:Output; result.position=transforms.projection*transforms.view*transforms.world*vec4<f32>(position,1.0);
 result.color=clamp(color,vec4<f32>(0.0),vec4<f32>(1.0)); result.uv=${textured?'uv':'vec2<f32>(0.0)'}; return result;
 }`;
 const pixel=`${io}
 ${textured?'@group(2) @binding(0) var image:texture_2d<f32>; @group(2) @binding(16) var imageSampler:sampler;':''}
 @fragment fn main(input:Output)->@location(0) vec4<f32> {${textured?'let texel=textureSample(image,imageSampler,input.uv); return vec4<f32>(texel.rgb*input.color.rgb,texel.a);':'return input.color;'}}`;
 return {fixed:true,vertex:{wgsl:vertex,inputs,uniforms:[{type:0,index:0,count:12,constant:false}],constants:[],samplers:[]},pixel:{wgsl:pixel,uniforms:[],constants:[],samplers:textured?[{group:2,dimension:1,textureBinding:0,samplerBinding:16}]:[]}};
}
