import {SamplerCache} from './d3d9-samplers.js';
import {D3D9RenderState} from './d3d9-state.js';
import {PipelineCache} from './d3d9-pipelines.js';
import {packShaderUniforms} from './shader-uniforms.js';
export function decodeDraw(memory,pointer,length){
 if(!(memory instanceof SharedArrayBuffer)||![pointer,length].every(Number.isInteger)||pointer<4096||pointer%4||length%4||length<5500||length>16384||pointer+length>memory.byteLength)throw RangeError('invalid draw packet range');
 const w=new Uint32Array(memory,pointer,length/4).slice();let p=0;const take=n=>{if(p+n>w.length)throw RangeError('truncated draw packet');const v=w.slice(p,p+n);p+=n;return v};
 const [magic,vertex,pixel,kind,count,first,index,base,max,declarationLength,stateCount]=take(11);
 if(magic!==0x39445246||![1,2,4].includes(kind)||count<1||count>1048576||count%({1:1,2:2,4:3})[kind]||declarationLength<16||declarationLength>520||declarationLength%8||stateCount!==20)throw RangeError('invalid draw header');
 const streams=Array.from({length:16},()=>{const [id,offset,stride]=take(3);return{id,offset,stride}}),state=new D3D9RenderState(),seen=new Set();
 for(let i=0;i<stateCount;i++){const [type,value]=take(2);if(seen.has(type))throw RangeError('duplicate render state');seen.add(type);state.set(type,value)}
 const declaration=new Uint8Array(take(declarationLength/4).buffer),registers=[[take(1024),take(64),take(16)],[take(128),take(64),take(16)]];
 const textures=take(16),samplers=Array.from({length:16},()=>take(14)),viewport=take(6);
 if(p!==w.length)throw RangeError('trailing draw packet data');
 return{vertex,pixel,kind,count,first,index,base:base|0,max,streams,state,declaration,registers,textures,samplers,viewport};
}
export class DrawRenderer{
 constructor(device,backend){this.device=device;this.backend=backend;this.cache=new PipelineCache(device,backend.shaders);this.samplers=new SamplerCache(device);this.uniforms=[0,1].map(()=>device.createBuffer({size:4608,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}));}
 async draw(packet){
  const d=this.device,b=this.backend,topology=({1:'point-list',2:'line-list',4:'triangle-list'})[packet.kind];
  const [x,y,width,height,minBits,maxBits]=packet.viewport,minDepth=new Float32Array(new Uint32Array([minBits]).buffer)[0],maxDepth=new Float32Array(new Uint32Array([maxBits]).buffer)[0];
  if(!width||!height||x+width>b.color.width||y+height>b.color.height||!Number.isFinite(minDepth)||!Number.isFinite(maxDepth)||minDepth<0||maxDepth>1||minDepth>maxDepth)throw RangeError('invalid draw viewport');
  const entry=await this.cache.get(packet.vertex,packet.pixel,packet.declaration,packet.streams,packet.state,{topology});
  const bindings=entry.layout.map(layout=>{const s=packet.streams[layout.stream],buffer=b.buffers.get(s.id),extent=Math.max(...layout.attributes.map(a=>a.offset+(a.format==='float32'?1:Number(a.format.at(-1)))*4));if(buffer.kind!==6||s.offset%4||s.offset+packet.max*s.stride+extent>buffer.size)throw RangeError('draw exceeds vertex buffer');return {buffer:buffer.buffer,offset:s.offset,size:buffer.size-s.offset};});
  let index;if(packet.index){index=b.buffers.get(packet.index);const width=index.format===101?2:4;if(index.kind!==7||(packet.first+packet.count)*width>index.size)throw RangeError('draw exceeds index buffer');}else if(packet.max!==packet.first+packet.count-1)throw RangeError('invalid nonindexed vertex range');
  const packed=[entry.shaders.vertex,entry.shaders.pixel].map((s,i)=>packShaderUniforms(s,packet.registers[i]));
  const textureEntries=[];
  if(entry.shaders.vertex.samplers.length)throw RangeError('vertex texture sampling unsupported');
  for(const s of entry.shaders.pixel.samplers){
   if(s.group!==2||s.dimension!==1||s.textureBinding>=16)throw RangeError('unsupported texture sampler reflection');
   const texture=b.textures.get(packet.textures[s.textureBinding]);
   textureEntries.push({binding:s.textureBinding,resource:texture.texture.createView()},{binding:s.samplerBinding,resource:this.samplers.get(packet.samplers[s.textureBinding],texture.levels)});
  }
  const groups=[],last=packed[1].length?3:textureEntries.length?2:packed[0].length?1:-1;
  for(let group=0;group<=last;group++){const stage=group===1?0:group===3?1:-1;let entries=group===2?textureEntries:[];if(stage>=0&&packed[stage].length){d.queue.writeBuffer(this.uniforms[stage],0,packed[stage]);entries=[{binding:0,resource:{buffer:this.uniforms[stage],size:packed[stage].byteLength}}]}groups.push(d.createBindGroup({layout:entry.pipeline.getBindGroupLayout(group),entries}));}
  const encoder=d.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:b.color.createView(),loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:b.depth.createView(),depthLoadOp:'load',depthStoreOp:'store',stencilLoadOp:'load',stencilStoreOp:'store'}});
  pass.setViewport(x,y,width,height,minDepth,maxDepth);pass.setPipeline(entry.pipeline);packet.state.applyDynamic(pass);bindings.forEach((s,i)=>pass.setVertexBuffer(i,s.buffer,s.offset,s.size));groups.forEach((g,i)=>pass.setBindGroup(i,g));
  if(index){pass.setIndexBuffer(index.buffer,index.format===101?'uint16':'uint32');pass.drawIndexed(packet.count,1,packet.first,packet.base,0)}else pass.draw(packet.count,1,packet.first,0);pass.end();d.queue.submit([encoder.finish()]);
 }
 dispose(){this.cache.dispose();this.samplers.dispose();for(const u of this.uniforms)u.destroy();}
}
