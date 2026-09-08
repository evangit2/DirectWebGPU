// MojoShader SPIR-V groups float, int and bool registers into arrays. Each
// element occupies 16 bytes, including boolean elements under std140 layout.
export function packShaderUniforms(shader,registers){
 const groups=[[],[],[]];let count=0;
 for(const u of shader.uniforms){
  if(!Number.isInteger(u.type)||u.type<0||u.type>2||!Number.isInteger(u.index)||u.index<0||!Number.isInteger(u.count)||u.count<1||u.count>256||count+u.count>288)throw Error('unsupported uniform reflection range');
  if(u.constant)throw Error('constant uniform arrays unsupported');groups[u.type].push(u);count+=u.count;
 }
 const result=new Uint32Array(count*4);let offset=0;
 for(let type=0;type<3;type++){
  const width=type===2?1:4,source=registers[type];
  if(!(source instanceof Uint32Array))throw Error('shader registers must contain DWORD bit patterns');
  for(const u of groups[type]){
   if(u.index+u.count>source.length/width)throw Error('shader uniform exceeds register file');
   for(let i=0;i<u.count;i++){
    const index=u.index+i,constant=shader.constants.find(c=>c.type===type&&c.index===index);
    for(let component=0;component<width;component++)result[offset+component]=constant?constant.words[component]:source[index*width+component];
    offset+=4;
   }
  }
 }
 return result;
}
