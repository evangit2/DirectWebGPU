// MojoShader SPIR-V groups float, int and bool registers into arrays. Each
// element occupies 16 bytes, including boolean elements under std140 layout.
// Reflection is immutable for a shader object, so compile the packing plan
// once and keep the per-draw path limited to register copies.
const plans=new WeakMap();
function planFor(shader){
 let plan=plans.get(shader);if(plan)return plan;
 const groups=[[],[],[]];let count=0;
 for(const u of shader.uniforms){
  if(!Number.isInteger(u.type)||u.type<0||u.type>2||!Number.isInteger(u.index)||u.index<0||!Number.isInteger(u.count)||u.count<1||u.count>256||count+u.count>288)throw Error('unsupported uniform reflection range');
  if(u.constant)throw Error('constant uniform arrays unsupported');groups[u.type].push({index:u.index,count:u.count});count+=u.count;
 }
 const constants=new Map();
 for(const c of shader.constants)constants.set(c.type*1048576+c.index,c.words);
 let bindings=null;
 if(shader.uniformBindings!==undefined){
  if(!Array.isArray(shader.uniformBindings)||shader.uniformBindings.length>3)throw Error('invalid uniform binding reflection');
  const seen=new Set();bindings=shader.uniformBindings.map(binding=>{
   if(!Number.isInteger(binding.binding)||binding.binding<0||binding.binding>2||seen.has(binding.binding)||binding.offsetBytes!==[0,4096,4352][binding.binding]||!Number.isInteger(binding.sizeBytes)||binding.sizeBytes<16||binding.sizeBytes>4096||binding.sizeBytes%16)throw Error('unsupported uniform binding range');
   seen.add(binding.binding);return binding;
  });
 }
 plan={groups,count,bindings};plan.constants=constants;plans.set(shader,plan);return plan;
}
export function shaderUniformByteLength(shader){const plan=planFor(shader);return(plan.bindings?.length?4608:plan.count*16);}
export function packShaderUniformsInto(shader,registers,result,wordOffset=0){
 const plan=planFor(shader),words=(plan.bindings?.length?4608/4:plan.count*4);
 if(!(result instanceof Uint32Array)||!Number.isInteger(wordOffset)||wordOffset<0||wordOffset+words>result.length)throw RangeError('shader uniform destination too small');
 result.fill(0,wordOffset,wordOffset+words);let offset=0;
 for(let type=0;type<3;type++){
  const width=type===2?1:4,source=registers[type];
  if(!(source instanceof Uint32Array))throw Error('shader registers must contain DWORD bit patterns');
  for(const u of plan.groups[type]){
   if(u.index+u.count>source.length/width)throw Error('shader uniform exceeds register file');
   for(let i=0;i<u.count;i++){
    if(plan.bindings)offset=[0,4096,4352][type]/4+(u.index+i)*4;
    const index=u.index+i,constant=plan.constants.get(type*1048576+index);
    if(constant)for(let component=0;component<width;component++)result[wordOffset+offset+component]=constant[component];
    else for(let component=0;component<width;component++)result[wordOffset+offset+component]=source[index*width+component];
    if(!plan.bindings)offset+=4;
   }
  }
 }
 return words*4;
}
export function packShaderUniforms(shader,registers){
 const result=new Uint32Array(shaderUniformByteLength(shader)/4);packShaderUniformsInto(shader,registers,result);return result;
}
