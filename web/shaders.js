// Reusable bytecode translator. No application-specific shaders or geometry.
import createMojo from './generated/mojoshader.js';
import initNaga,{spirv_to_wgsl} from './generated/shader_translation.js';
let initialized;
export async function createShaderTranslator(){
 initialized??=Promise.all([createMojo(),initNaga()]);
 const [mojo]=await initialized;
 return {translatePair(vertex,pixel){
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
    return {spirvBytes:length,wgsl:spirv_to_wgsl(spv)};
   });
   return {vertex:stages[0],pixel:stages[1]};
  }finally{mojo._shader_reset();if(vp)mojo._free(vp);if(pp)mojo._free(pp);}
 }};
}
