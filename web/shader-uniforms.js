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
 plan={groups,count};plan.constants=constants;plans.set(shader,plan);return plan;
}
export function packShaderUniforms(shader,registers){
 const plan=planFor(shader),result=new Uint32Array(plan.count*4);let offset=0;
 for(let type=0;type<3;type++){
  const width=type===2?1:4,source=registers[type];
  if(!(source instanceof Uint32Array))throw Error('shader registers must contain DWORD bit patterns');
  for(const u of plan.groups[type]){
   if(u.index+u.count>source.length/width)throw Error('shader uniform exceeds register file');
   for(let i=0;i<u.count;i++){
    const index=u.index+i,constant=plan.constants.get(type*1048576+index);
    if(constant)for(let component=0;component<width;component++)result[offset+component]=constant[component];
    else for(let component=0;component<width;component++)result[offset+component]=source[index*width+component];
    offset+=4;
   }
  }
 }
 return result;
}
