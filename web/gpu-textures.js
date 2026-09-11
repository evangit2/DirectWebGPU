// GPU-resident 2D and cube textures; full-mip uploads preserve guest row pitch.
const FORMATS=new Map([
 [20,['rgba8unorm',1,3,true]],[21,['bgra8unorm',1,4,false]],[22,['bgra8unorm',1,4,false]],
 [23,['rgba8unorm',1,2,true]],[24,['rgba8unorm',1,2,true]],[25,['rgba8unorm',1,2,true]],[26,['rgba8unorm',1,2,true]],
 [28,['rgba8unorm',1,1,true]],[29,['rgba8unorm',1,2,true]],[50,['rgba8unorm',1,1,true]],
 [0x31545844,['bc1-rgba-unorm',4,8,false]],[0x33545844,['bc2-rgba-unorm',4,16,false]],[0x35545844,['bc3-rgba-unorm',4,16,false]]
]);
const DEPTH_FORMATS=new Map([[75,'depth24plus-stencil8']]);
export class TextureStorage {
 constructor(device,{traceUploads=false}={}){this.device=device;this.traceUploads=traceUploads;this.items=new Map();this.bytes=0;this.nextId=1;}
 async create(width,height,levels,format,faces=1,usage=0){
  const f=FORMATS.get(format);
  if(!f||![width,height,levels,faces,usage].every(Number.isInteger)||![0,1,0x200].includes(usage)||![1,6].includes(faces)||faces===6&&width!==height||width<1||height<1||width>4096||height>4096||levels<0||levels>1+Math.floor(Math.log2(Math.max(width,height)))||usage===1&&![21,22].includes(format))throw RangeError('unsupported texture description');
  const [gpuFormat,block,blockBytes,conversion]=f;
  if(block===4&&(!this.device.features.has('texture-compression-bc')||width%4||height%4))throw RangeError('BC texture unsupported or base dimensions unaligned');
  levels ||= 1+Math.floor(Math.log2(Math.max(width,height)));
  const mips=Array.from({length:levels},(_,level)=>{const w=Math.max(1,width>>level),h=Math.max(1,height>>level),columns=Math.ceil(w/block),rows=Math.ceil(h/block);return {width:w,height:h,physicalWidth:columns*block,physicalHeight:rows*block,rowBytes:columns*blockBytes,rows};});
  const bytes=faces*mips.reduce((n,m)=>n+m.width*m.height*(conversion?4:blockBytes/(block*block)),0);
  if(this.items.size>=4096||this.bytes+bytes>128*1024*1024||this.nextId>=0x80000000)throw RangeError('texture budget exceeded');
  const d=this.device;d.pushErrorScope('validation');d.pushErrorScope('out-of-memory');let texture;
  try{texture=d.createTexture({label:faces===6?'D3D cube texture':'D3D 2D texture',size:{width,height,depthOrArrayLayers:faces},mipLevelCount:levels,format:gpuFormat,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC|(usage===1?GPUTextureUsage.RENDER_ATTACHMENT:0)});}
  finally{const oom=await d.popErrorScope(),error=await d.popErrorScope();if(oom||error){texture?.destroy();throw Error((oom??error).message)}}
  const dimension=faces===6?3:1,view=texture.createView(faces===6?{dimension:'cube'}:undefined);
  const id=this.nextId++;this.items.set(id,{texture,view,width,height,faces,dimension,levels,format,gpuFormat,block,blockBytes,conversion,mips,bytes,usage,surface:false,attachmentViews:new Map(),...(this.traceUploads?{uploads:[]}:{})});this.bytes+=bytes;return id;
 }
 async createSurface(width,height,format,usage){
  if(![width,height,format,usage].every(Number.isInteger)||width<1||height<1||width>4096||height>4096||![1,2].includes(usage))throw RangeError('unsupported surface description');
  const gpuFormat=usage===1&&[21,22].includes(format)?'bgra8unorm':usage===2?DEPTH_FORMATS.get(format):null;
  if(!gpuFormat)throw RangeError('unsupported surface format');
  const bytes=width*height*4;if(this.items.size>=4096||this.bytes+bytes>128*1024*1024||this.nextId>=0x80000000)throw RangeError('texture budget exceeded');
  const d=this.device;d.pushErrorScope('validation');d.pushErrorScope('out-of-memory');let texture;
  try{texture=d.createTexture({label:usage===1?'D3D render-target surface':'D3D depth-stencil surface',size:[width,height],format:gpuFormat,usage:GPUTextureUsage.RENDER_ATTACHMENT|(usage===1?GPUTextureUsage.COPY_SRC:0)});}
  finally{const oom=await d.popErrorScope(),error=await d.popErrorScope();if(oom||error){texture?.destroy();throw Error((oom??error).message)}}
  const id=this.nextId++,view=texture.createView();this.items.set(id,{texture,view,width,height,faces:1,dimension:1,levels:1,format,gpuFormat,bytes,usage,surface:true,attachmentViews:new Map()});this.bytes+=bytes;return id;
 }
 get(id){const item=this.items.get(id);if(!item)throw RangeError('invalid or released texture handle');return item;}
 attachment(id,face,level,usage){
  const t=this.get(id);
  if(t.usage!==usage||!Number.isInteger(face)||!Number.isInteger(level)||face<0||face>=t.faces||level<0||level>=t.levels)throw RangeError('invalid render attachment');
  const mip=t.mips?.[level],width=mip?.width??t.width,height=mip?.height??t.height,key=`${face}:${level}`;
  let view=t.attachmentViews.get(key);if(!view){view=t.texture.createView({dimension:'2d',baseArrayLayer:face,arrayLayerCount:1,baseMipLevel:level,mipLevelCount:1});t.attachmentViews.set(key,view);}
  return{texture:t.texture,view,width,height,format:t.gpuFormat,textureId:id,face,level,stencil:gpuFormatHasStencil(t.gpuFormat)};
 }
 upload(id,level,memory,pointer,pitch,length,layer=0){
  const t=this.get(id);
  if(t.surface)throw RangeError('standalone surfaces are not lockable');
  const m=t.mips[level];
  if(!Number.isInteger(level)||!m||!Number.isInteger(layer)||layer<0||layer>=t.faces||!(memory instanceof SharedArrayBuffer)||![pointer,pitch,length].every(Number.isInteger)||pointer<4096||pitch<m.rowBytes||pitch%t.blockBytes||length<(m.rows-1)*pitch+m.rowBytes||length>128*1024*1024||pointer+length>memory.byteLength)throw RangeError('invalid texture upload range');
  let data=new Uint8Array(memory,pointer,length);
  // X8R8G8B8 must sample with alpha one, regardless of unused guest byte.
  if(t.format===22){data=data.slice();for(let y=0;y<m.rows;y++)for(let x=3;x<m.rowBytes;x+=4)data[y*pitch+x]=255;}
  if(t.conversion){
   const expanded=new Uint8Array(m.width*m.height*4),scale=(bits,v)=>Math.round(v*255/((1<<bits)-1));
   for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){
    const at=y*pitch+x*t.blockBytes;let r=0,g=0,b=0,a=255;
    if(t.format===20){r=data[at];g=data[at+1];b=data[at+2];}
    else if(t.format===23){const v=data[at]|data[at+1]<<8;r=scale(5,(v>>11)&31);g=scale(6,(v>>5)&63);b=scale(5,v&31);}
    else if(t.format===24||t.format===25||t.format===26||t.format===29){const v=data[at]|data[at+1]<<8;if(t.format===24||t.format===25){r=scale(5,(v>>10)&31);g=scale(5,(v>>5)&31);b=scale(5,v&31);if(t.format===25)a=(v&0x8000)?255:0;}else if(t.format===26){r=((v>>8)&15)*17;g=((v>>4)&15)*17;b=(v&15)*17;a=((v>>12)&15)*17;}else{const c=v&255;r=scale(3,(c>>5)&7);g=scale(3,(c>>2)&7);b=scale(2,c&3);a=v>>8;}}
    else if(t.format===28){a=data[at];}
    else if(t.format===50){r=g=b=data[at];}
    const o=(y*m.width+x)*4;expanded.set([r,g,b,a],o);
   }
   data=expanded;pitch=m.width*4;
  }
  if(this.traceUploads){const sampleCount=Math.min(1024,m.width*m.height),step=Math.max(1,Math.floor(m.width*m.height/sampleCount)),channelSums=[0,0,0,0];let sampled=0;
   if(t.block===1&&data.byteLength>=m.width*m.height*4){for(let pixel=0;pixel<m.width*m.height&&sampled<sampleCount;pixel+=step){const y=Math.floor(pixel/m.width),x=pixel-y*m.width,at=y*pitch+x*4;for(let channel=0;channel<4;channel++)channelSums[channel]+=data[at+channel];sampled++;}}
   t.uploads[layer*t.levels+level]={layer,level,length:data.byteLength,pitch,sampledPixels:sampled,meanChannels:sampled?channelSums.map(value=>Math.round(value/sampled)):null,firstBytes:Array.from(data.slice(0,16))};
  }
  this.device.queue.writeTexture({texture:t.texture,mipLevel:level,origin:{x:0,y:0,z:layer}},data,{bytesPerRow:pitch,rowsPerImage:m.rows},[m.physicalWidth,m.physicalHeight,1]);
 }
 destroy(id){const t=this.get(id);t.texture.destroy();this.items.delete(id);this.bytes-=t.bytes;}
 dispose(){for(const id of this.items.keys())this.destroy(id);}
}
function gpuFormatHasStencil(format){return format==='depth24plus-stencil8'||format==='depth32float-stencil8'}
