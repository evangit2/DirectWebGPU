// Reusable bytecode translator. No application-specific shaders or geometry.
import createMojo from './generated/mojoshader.js';
import initNaga,{spirv_to_wgsl,sampler_bindings,alpha_test_wgsl,vertex_inputs_wgsl} from './generated/shader_translation.js';
// Naga 30 emits f32::MAX as a shortest-roundtrip decimal above the finite
// range accepted by browser WGSL parsers. Hexadecimal preserves the exact bits.
export function canonicalFloatLimits(source){return source.replace(/\b340282350000000000000000000000000000000f\b/g,'0x1.fffffep+127f');}
let initialized;
export async function createShaderTranslator(){
 initialized??=Promise.all([createMojo(),initNaga()]);
 const [mojo]=await initialized;
 return {validate(stage,bytes){
  if(![0,1].includes(stage)||!(bytes instanceof Uint8Array)||bytes.length<8||bytes.length>1048576||bytes.length%4)throw Error('invalid shader bytecode range');
  const pointer=mojo._malloc(bytes.length);if(!pointer)throw Error('shader validation allocation failed');
  try{mojo.HEAPU8.set(bytes,pointer);if(!mojo._shader_validate(stage,pointer,bytes.length))throw Error(mojo.UTF8ToString(mojo._shader_error()));}finally{mojo._free(pointer)}
 },vertexInputs:(...args)=>canonicalFloatLimits(vertex_inputs_wgsl(...args)),alphaTest:(...args)=>canonicalFloatLimits(alpha_test_wgsl(...args)),translatePair(vertex,pixel){
  for(const input of [vertex,pixel])if(!(input instanceof Uint8Array)||input.length<8||input.length>1048576||input.length%4)throw Error('invalid DX9 bytecode length');
  let vp=0,pp=0;
  try{
   vp=mojo._malloc(vertex.length);pp=mojo._malloc(pixel.length);
   if(!vp||!pp)throw Error('shader allocation failed');
   mojo.HEAPU8.set(vertex,vp);mojo.HEAPU8.set(pixel,pp);
   if(!mojo._shader_pair(vp,vertex.length,pp,pixel.length))throw Error(mojo.UTF8ToString(mojo._shader_error()));
   const stages=[0,1].map(stage=>{
    const ptr=mojo._shader_output(stage),length=mojo._shader_length(stage);
    if(!ptr||length<20||ptr+length>mojo.HEAPU8.length)throw Error('invalid linked SPIR-V bounds');
    const spv=mojo.HEAPU8.slice(ptr,ptr+length);
    const count=mojo._shader_uniform_count(stage),constantCount=mojo._shader_constant_count(stage);
    if(count<0||count>4096||constantCount<0||constantCount>4096)throw Error('invalid shader reflection count');
    const uniforms=Array.from({length:count},(_,index)=>{const f=Array.from({length:4},(_,field)=>mojo._shader_uniform_value(stage,index,field));return {type:f[0],index:f[1],count:Math.max(1,f[2]),constant:!!f[3]}});
    const constants=Array.from({length:constantCount},(_,index)=>{const f=Array.from({length:6},(_,field)=>mojo._shader_constant_value(stage,index,field)>>>0);return {type:f[0],index:f[1],words:f.slice(2)}});
    const bindings=sampler_bindings(spv);if(bindings.length%4||bindings.length>128)throw Error('invalid sampler reflection');
    const samplers=Array.from({length:bindings.length/4},(_,i)=>({group:bindings[i*4],textureBinding:bindings[i*4+1],samplerBinding:bindings[i*4+2],dimension:bindings[i*4+3]}));
    return {samplers,spirvBytes:length,wgsl:canonicalFloatLimits(spirv_to_wgsl(spv)),uniformGroup:stage?3:1,uniforms,constants};
   });
   const inputCount=mojo._shader_input_count();if(inputCount<0||inputCount>16)throw Error('invalid shader input count');
   stages[0].inputs=Array.from({length:inputCount},(_,i)=>({usage:mojo._shader_input_value(i,0),index:mojo._shader_input_value(i,1),location:mojo._shader_input_value(i,2)}));
   return {vertex:stages[0],pixel:stages[1]};
  }finally{mojo._shader_reset();if(vp)mojo._free(vp);if(pp)mojo._free(pp);}
 }};
}
