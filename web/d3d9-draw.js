import {SamplerCache} from './d3d9-samplers.js';
import {D3D9RenderState} from './d3d9-state.js';
import {PipelineCache} from './d3d9-pipelines.js';
import {packShaderUniforms} from './shader-uniforms.js';
const UNIFORM_SLOTS=2048,UNIFORM_STRIDE=4608;
function defaultTextureStages(){return Array.from({length:8},(_,stage)=>new Uint32Array(stage===0?[4,2,1,2,2,1,0,0]:[1,2,1,1,2,1,stage,0]));}
export function decodeDraw(memory,pointer,length){
 if(!(memory instanceof SharedArrayBuffer)||![pointer,length].every(Number.isInteger)||pointer<4096||pointer%4||length%4||length<2048||length>16384||pointer+length>memory.byteLength)throw RangeError('invalid draw packet range');
 const w=new Uint32Array(memory,pointer,length/4).slice();let p=0;const take=n=>{if(p+n>w.length)throw RangeError('truncated draw packet');const v=w.slice(p,p+n);p+=n;return v};
 const [magic,vertex,pixel,kind,count,first,index,base,max,declarationLength,stateCount]=take(11);
 const fixedHeader=vertex===0&&pixel===0,compactFixed=magic===0x32445246;
 if(magic!==0x39445246&&!(compactFixed&&fixedHeader)||![1,2,4].includes(kind)||count<1||count>1048576||count%({1:1,2:2,4:3})[kind]||declarationLength<16||declarationLength>520||declarationLength%8||![20,21].includes(stateCount))throw RangeError('invalid draw header');
 const streams=Array.from({length:16},()=>{const [id,offset,stride]=take(3);return{id,offset,stride}}),state=new D3D9RenderState(),seen=new Set();
 for(let i=0;i<stateCount;i++){const [type,value]=take(2);if(seen.has(type))throw RangeError('duplicate render state');seen.add(type);state.set(type,value)}
 const declaration=new Uint8Array(take(declarationLength/4).buffer),registers=compactFixed?[[new Uint32Array(1024),new Uint32Array(64),new Uint32Array(16)],[new Uint32Array(128),new Uint32Array(64),new Uint32Array(16)]]:[[take(1024),take(64),take(16)],[take(128),take(64),take(16)]];
 const textures=take(16),samplers=Array.from({length:16},()=>take(14)),remaining=w.length-p;
 const hasTextureStages=remaining===(fixedHeader?214:70)||remaining===(fixedHeader?118:70),textureStages=hasTextureStages?Array.from({length:8},()=>take(8)):defaultTextureStages(),viewport=take(6);
 const fixed=fixedHeader?take(48):null,lighting=fixedHeader&&p+96===w.length?take(96):null;
 if(fixed){registers[0][0].set(fixed);if(lighting)registers[0][0].set(lighting,fixed.length);}
 if(p!==w.length)throw RangeError('trailing draw packet data');
 return{fixed,lighting,vertex,pixel,kind,count,first,index,base:base|0,max,streams,state,declaration,registers,textures,samplers,textureStages,viewport};
}
export class DrawRenderer{
 constructor(device,backend){this.device=device;this.backend=backend;this.cache=new PipelineCache(device,backend.shaders);this.samplers=new SamplerCache(device);this.uniformBytes=UNIFORM_STRIDE*UNIFORM_SLOTS;this.uniforms=[0,1].map(stage=>device.createBuffer({label:`D3D9 ${stage?'pixel':'vertex'} uniform ring`,size:this.uniformBytes,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}));this.uniformShadow=[new Uint8Array(this.uniformBytes),new Uint8Array(this.uniformBytes)];this.pendingUniformBytes=[0,0];this.stagingSize=16*1024*1024;this.staging=device.createBuffer({label:'D3D9 dynamic upload staging',size:this.stagingSize,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});this.stagingShadow=new Uint8Array(this.stagingSize);this.stagingCursor=0;this.bindingCaches=new WeakMap();this.uniformCursor=0;this.encoder=null;this.pass=null;this.writeMetrics={sourceGeometryWrites:0,sourceUniformWrites:0,queueWriteCalls:0,queueWriteBytes:0,rendererSubmissions:0};}
 draw(packet){
  const timingStart=performance.now();
  const d=this.device,b=this.backend,topology=({1:'point-list',2:'line-list',4:'triangle-list'})[packet.kind];
  const [x,y,width,height,minBits,maxBits]=packet.viewport,minDepth=new Float32Array(new Uint32Array([minBits]).buffer)[0],maxDepth=new Float32Array(new Uint32Array([maxBits]).buffer)[0];
  if(!width||!height||x+width>b.color.width||y+height>b.color.height||!Number.isFinite(minDepth)||!Number.isFinite(maxDepth)||minDepth<0||maxDepth>1||minDepth>maxDepth)throw RangeError('invalid draw viewport');
  const textureStages=packet.textureStages??defaultTextureStages(),textured=!!packet.textures[0]&&textureStages[0][0]!==1;
  const cached=this.cache.get(packet.vertex,packet.pixel,packet.declaration,packet.streams,packet.state,{topology,fixed:!!packet.fixed,textured,textureStages,lighting:packet.lighting,viewportSize:[width,height]});
  if(cached?.then)return cached.then(entry=>this.drawWithEntry(packet,entry,timingStart));
 return this.drawWithEntry(packet,cached,timingStart);
 }
 prepareBufferUpload(){if(this.pass){this.pass.end();this.pass=null;}this.encoder??=this.device.createCommandEncoder();}
 uploadBuffer(buffer,offset,data){
  const length=Math.ceil(data.byteLength/4)*4;
  if(length>this.stagingSize)throw RangeError('geometry upload exceeds staging capacity');
  if(this.stagingCursor+length>this.stagingSize)this.flush();
  this.prepareBufferUpload();
  this.stagingShadow.set(data,this.stagingCursor);this.writeMetrics.sourceGeometryWrites++;
  this.encoder.copyBufferToBuffer(this.staging,this.stagingCursor,buffer,offset,length);
  this.stagingCursor+=length;
 }
 stageUniform(stage,offset,data){
  if(![0,1].includes(stage)||!Number.isInteger(offset)||offset<0||offset%4||!(ArrayBuffer.isView(data))||offset+data.byteLength>this.uniformBytes)throw RangeError('invalid uniform staging range');
  this.uniformShadow[stage].set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength),offset);this.pendingUniformBytes[stage]=Math.max(this.pendingUniformBytes[stage],offset+data.byteLength);this.writeMetrics.sourceUniformWrites++;
 }
 drawWithEntry(packet,entry,timingStart){
  const d=this.device,b=this.backend,[x,y,width,height,minBits,maxBits]=packet.viewport,minDepth=new Float32Array(new Uint32Array([minBits]).buffer)[0],maxDepth=new Float32Array(new Uint32Array([maxBits]).buffer)[0];
  const bindings=entry.layout.map(layout=>{const s=packet.streams[layout.stream],buffer=b.buffers.get(s.id),extent=Math.max(...layout.attributes.map(a=>a.offset+(a.format==='float32'?1:Number(a.format.at(-1)))*4));if(buffer.kind!==6||s.offset%4||s.offset+packet.max*s.stride+extent>buffer.size)throw RangeError('draw exceeds vertex buffer');return {buffer:buffer.buffer,offset:s.offset,size:buffer.size-s.offset};});
  let index;if(packet.index){index=b.buffers.get(packet.index);const width=index.format===101?2:4;if(index.kind!==7||(packet.first+packet.count)*width>index.size)throw RangeError('draw exceeds index buffer');}else if(packet.max!==packet.first+packet.count-1)throw RangeError('invalid nonindexed vertex range');
  const packed=[entry.shaders.vertex,entry.shaders.pixel].map((s,i)=>packShaderUniforms(s,packet.registers[i]));
  const textureEntries=[];
  if(entry.shaders.vertex.samplers.length)throw RangeError('vertex texture sampling unsupported');
  const textureKey=[];
  for(const s of entry.shaders.pixel.samplers){
   const sourceIndex=s.sourceIndex??s.textureBinding;
   if(s.group!==2||s.dimension!==1||sourceIndex>=16||s.textureBinding>=32||s.samplerBinding>=32)throw RangeError('unsupported texture sampler reflection');
   const textureId=packet.textures[sourceIndex],texture=b.textures.get(textureId),samplerState=packet.samplers[sourceIndex];
   textureKey.push(sourceIndex,textureId,...samplerState);
   textureEntries.push({binding:s.textureBinding,resource:texture.view},{binding:s.samplerBinding,resource:this.samplers.get(samplerState,texture.levels)});
  }
  if(this.uniformCursor>=UNIFORM_SLOTS)this.flush();
  const uniformSlot=this.uniformCursor++;
  let bindingCache=this.bindingCaches.get(entry);if(!bindingCache){bindingCache={static:new Map(),uniform:new Map(),textures:new Map()};this.bindingCaches.set(entry,bindingCache);}
  const groups=[],last=packed[1].length?3:textureEntries.length?2:packed[0].length?1:-1;
  for(let group=0;group<=last;group++){
   const stage=group===1?0:group===3?1:-1;
   if(stage>=0&&packed[stage].length){
   const buffer=this.uniforms[stage],offset=uniformSlot*UNIFORM_STRIDE;this.stageUniform(stage,offset,packed[stage]);
    const key=`${stage}:${uniformSlot}:${packed[stage].byteLength}`;let bindGroup=bindingCache.uniform.get(key);
    const reflected=entry.shaders[stage?'pixel':'vertex'].uniformBindings;
    const entries=reflected?.length?reflected.map(binding=>({binding:binding.binding,resource:{buffer,offset:offset+binding.offsetBytes,size:binding.sizeBytes}})):[{binding:0,resource:{buffer,offset,size:packed[stage].byteLength}}];
    if(!bindGroup)bindGroup=d.createBindGroup({layout:entry.pipeline.getBindGroupLayout(group),entries}),bindingCache.uniform.set(key,bindGroup);
    groups.push(bindGroup);
   }else if(group===2&&textureEntries.length){
    const key=textureKey.join(',');let bindGroup=bindingCache.textures.get(key);
    if(!bindGroup)bindGroup=d.createBindGroup({layout:entry.pipeline.getBindGroupLayout(group),entries:textureEntries}),bindingCache.textures.set(key,bindGroup);
    groups.push(bindGroup);
   }else{
    let bindGroup=bindingCache.static.get(group);
    if(!bindGroup)bindGroup=d.createBindGroup({layout:entry.pipeline.getBindGroupLayout(group),entries:[]}),bindingCache.static.set(group,bindGroup);
    groups.push(bindGroup);
   }
  }
  const timestampWrites=b.timer?.begin((b.presents??0)+1);
  if(timestampWrites)this.flush();
  // A staged upload may already have recorded copyBufferToBuffer commands in
  // this encoder. Keep that encoder so the draw sees the new contents in the
  // same submitted command buffer. Replacing it here silently discarded every
  // upload after the first renderer warm-up, which particularly broke
  // DrawPrimitiveUP/D3D8 user-pointer geometry.
  if(!this.pass){this.encoder??=d.createCommandEncoder();this.pass=this.encoder.beginRenderPass({...(timestampWrites?{timestampWrites}:{}),colorAttachments:[{view:b.color.createView(),loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:b.depth.createView(),depthLoadOp:'load',depthStoreOp:'store',stencilLoadOp:'load',stencilStoreOp:'store'}});}
  const pass=this.pass;pass.setViewport(x,y,width,height,minDepth,maxDepth);pass.setPipeline(entry.pipeline);packet.state.applyDynamic(pass);bindings.forEach((s,i)=>pass.setVertexBuffer(i,s.buffer,s.offset,s.size));groups.forEach((g,i)=>pass.setBindGroup(i,g));
  if(index){pass.setIndexBuffer(index.buffer,index.format===101?'uint16':'uint32');pass.drawIndexed(packet.count,1,packet.first,packet.base,0)}else pass.draw(packet.count,1,packet.first,0);if(timestampWrites){this.flush();b.timer.cpuWallMs+=performance.now()-timingStart;}
 }
 flush(){if(this.pass){this.pass.end();this.pass=null;}if(!this.encoder)return;const queue=this.device.queue;if(this.stagingCursor){queue.writeBuffer(this.staging,0,this.stagingShadow.subarray(0,this.stagingCursor));this.writeMetrics.queueWriteCalls++;this.writeMetrics.queueWriteBytes+=this.stagingCursor;}for(let stage=0;stage<2;stage++){const bytes=this.pendingUniformBytes[stage];if(!bytes)continue;queue.writeBuffer(this.uniforms[stage],0,this.uniformShadow[stage].subarray(0,bytes));this.writeMetrics.queueWriteCalls++;this.writeMetrics.queueWriteBytes+=bytes;}queue.submit([this.encoder.finish()]);this.writeMetrics.rendererSubmissions++;this.encoder=null;this.stagingCursor=0;this.uniformCursor=0;this.pendingUniformBytes.fill(0);}
 snapshotMetrics(){return{...this.writeMetrics,pendingGeometryBytes:this.stagingCursor,pendingUniformBytes:[...this.pendingUniformBytes]};}
 dispose(){this.flush();this.cache.dispose();this.samplers.dispose();for(const buffer of this.uniforms)buffer.destroy();this.staging.destroy();}
}
