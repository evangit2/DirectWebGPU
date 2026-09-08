// GPU-resident 2D sampled textures; full-mip uploads preserve guest row pitch.
const FORMATS=new Map([[21,['bgra8unorm',1,4]],[22,['bgra8unorm',1,4]],[50,['rgba8unorm',1,1]],[0x31545844,['bc1-rgba-unorm',4,8]],[0x33545844,['bc2-rgba-unorm',4,16]],[0x35545844,['bc3-rgba-unorm',4,16]]]);
export class TextureStorage {
 constructor(device){this.device=device;this.items=new Map();this.bytes=0;this.nextId=1;}
 async create(width,height,levels,format){
  const f=FORMATS.get(format);
  if(!f||![width,height,levels].every(Number.isInteger)||width<1||height<1||width>4096||height>4096||levels<0||levels>1+Math.floor(Math.log2(Math.max(width,height))))throw RangeError('unsupported texture description');
  const [gpuFormat,block,blockBytes]=f;
  if(block===4&&(!this.device.features.has('texture-compression-bc')||width%4||height%4))throw RangeError('BC texture unsupported or base dimensions unaligned');
  levels ||= 1+Math.floor(Math.log2(Math.max(width,height)));
  const mips=Array.from({length:levels},(_,level)=>{const w=Math.max(1,width>>level),h=Math.max(1,height>>level),columns=Math.ceil(w/block),rows=Math.ceil(h/block);return {width:w,height:h,physicalWidth:columns*block,physicalHeight:rows*block,rowBytes:columns*blockBytes,rows};});
  const bytes=mips.reduce((n,m)=>n+m.rowBytes*m.rows*(format===50?4:1),0);
  if(this.items.size>=4096||this.bytes+bytes>128*1024*1024||this.nextId>=0x80000000)throw RangeError('texture budget exceeded');
  const d=this.device;d.pushErrorScope('validation');d.pushErrorScope('out-of-memory');let texture;
  try{texture=d.createTexture({label:'D3D9 sampled texture',size:[width,height],mipLevelCount:levels,format:gpuFormat,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC});}
  finally{const oom=await d.popErrorScope(),error=await d.popErrorScope();if(oom||error){texture?.destroy();throw Error((oom??error).message)}}
  const id=this.nextId++;this.items.set(id,{texture,width,height,levels,format,gpuFormat,block,blockBytes,mips,bytes});this.bytes+=bytes;return id;
 }
 get(id){const item=this.items.get(id);if(!item)throw RangeError('invalid or released texture handle');return item;}
 async upload(id,level,memory,pointer,pitch,length){
  const t=this.get(id),m=t.mips[level];
  if(!Number.isInteger(level)||!m||!(memory instanceof SharedArrayBuffer)||![pointer,pitch,length].every(Number.isInteger)||pointer<4096||pitch<m.rowBytes||pitch%t.blockBytes||length<(m.rows-1)*pitch+m.rowBytes||length>128*1024*1024||pointer+length>memory.byteLength)throw RangeError('invalid texture upload range');
  let data=new Uint8Array(memory,pointer,length);
  // X8R8G8B8 must sample with alpha one, regardless of unused guest byte.
  if(t.format===22){data=data.slice();for(let y=0;y<m.rows;y++)for(let x=3;x<m.rowBytes;x+=4)data[y*pitch+x]=255;}
  if(t.format===50){const expanded=new Uint8Array(m.width*m.height*4);for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){const v=data[y*pitch+x],o=(y*m.width+x)*4;expanded.set([v,v,v,255],o);}data=expanded;pitch=m.width*4;}
  this.device.pushErrorScope('validation');
  try{this.device.queue.writeTexture({texture:t.texture,mipLevel:level},data,{bytesPerRow:pitch,rowsPerImage:m.rows},[m.physicalWidth,m.physicalHeight]);}
  finally{const error=await this.device.popErrorScope();if(error)throw Error(error.message)}
 }
 destroy(id){const t=this.get(id);t.texture.destroy();this.items.delete(id);this.bytes-=t.bytes;}
 dispose(){for(const id of this.items.keys())this.destroy(id);}
}
