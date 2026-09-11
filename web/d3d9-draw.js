import {SamplerCache} from './d3d9-samplers.js';
import {D3D9RenderState,RS} from './d3d9-state.js';
import {PipelineCache} from './d3d9-pipelines.js';
import {packShaderUniformsInto,shaderUniformByteLength} from './shader-uniforms.js';
// A frame normally uses fewer than 200 uniform slices. A bounded 512-slice
// ring prevents auto-layout bind-group caches from accumulating tens of
// thousands of WebGPU wrappers, which makes V8 weak-handle scans hitch.
const UNIFORM_SLOTS=512,UNIFORM_STRIDE=4608;
const EMPTY_REGISTERS=new Uint32Array(0);
const alignUniform=value=>(value+255)&~255;
const floatBitsView=new DataView(new ArrayBuffer(4));
const floatFromBits=value=>{floatBitsView.setUint32(0,value,true);return floatBitsView.getFloat32(0,true);};
function drawScissor(packet,backend){const enabled=packet.state.get(RS.SCISSORTESTENABLE)!==0,rect=enabled?packet.scissor:[0,0,backend.color.width,backend.color.height];if(!rect||rect.length!==4)return null;const [left,top,right,bottom]=rect;if(![left,top,right,bottom].every(Number.isInteger)||left<0||top<0||right<=left||bottom<=top||right>backend.color.width||bottom>backend.color.height)return null;return[left,top,right,bottom]}
const DEFAULT_TEXTURE_STAGES=Object.freeze(Array.from({length:8},(_,stage)=>new Uint32Array(stage===0?[4,2,1,2,2,1,0,0]:[1,2,1,1,2,1,stage,0])));
function defaultTextureStages(){return DEFAULT_TEXTURE_STAGES}
const samplerAt=(samplers,index)=>samplers instanceof Uint32Array?samplers.subarray(index*14,index*14+14):samplers[index];
export function decodeDraw(memory,pointer,length){
 if(!(memory instanceof SharedArrayBuffer)||![pointer,length].every(Number.isInteger)||pointer<4096||pointer%4||length%4||length<2048||length>16384||pointer+length>memory.byteLength)throw RangeError('invalid draw packet range');
 // The caller keeps the synchronous RPC or draw-batch storage exclusively
 // owned until this draw completes, including asynchronous pipeline creation.
 // Parse bounded views into that storage instead of copying every packet and
 // every register bank. High draw rates otherwise create enough short-lived
 // typed arrays to produce visible garbage-collection stalls.
 const w=new Uint32Array(memory,pointer,length/4);let p=0;const take=n=>{if(p+n>w.length)throw RangeError('truncated draw packet');const v=w.subarray(p,p+n);p+=n;return v};
 const [magic,vertex,pixel,kind,count,first,index,base,max,declarationLength,stateCount]=take(11);
 const fixedHeader=vertex===0&&pixel===0,compactFixed=magic===0x32445246||magic===0x33445246,hasScissor=magic===0x41445246||magic===0x33445246;
 if(![0x39445246,0x41445246].includes(magic)&&!(compactFixed&&fixedHeader)||![1,2,4].includes(kind)||count<1||count>1048576||count%({1:1,2:2,4:3})[kind]||declarationLength<16||declarationLength>520||declarationLength%8||![20,21,22].includes(stateCount))throw RangeError('invalid draw header');
 const streams=Array.from({length:16},()=>{const [id,offset,stride]=take(3);return{id,offset,stride}}),state=new D3D9RenderState();
 for(let i=0;i<stateCount;i++){const [type,value]=take(2);if(state.has(type))throw RangeError('duplicate render state');state.set(type,value)}
 const declarationWords=take(declarationLength/4),declaration=new Uint8Array(declarationWords.buffer,declarationWords.byteOffset,declarationWords.byteLength);let registers=compactFixed?null:[[take(1024),take(64),take(16)],[take(128),take(64),take(16)]];
 const textures=take(16),samplers=take(16*14),remaining=w.length-p;
 const hasTextureStages=remaining===(fixedHeader?(hasScissor?218:214):(hasScissor?74:70))||remaining===(fixedHeader?(hasScissor?122:118):(hasScissor?74:70)),textureStages=hasTextureStages?Array.from({length:8},()=>take(8)):defaultTextureStages(),viewport=take(6),scissor=hasScissor?take(4):null;
 const fixed=fixedHeader?take(48):null,lighting=fixedHeader&&p+96===w.length?take(96):null;
 if(compactFixed){const floatWords=new Uint32Array(fixed.buffer,fixed.byteOffset,fixed.length+(lighting?.length??0));registers=[[floatWords,EMPTY_REGISTERS,EMPTY_REGISTERS],[EMPTY_REGISTERS,EMPTY_REGISTERS,EMPTY_REGISTERS]];}
 if(p!==w.length)throw RangeError('trailing draw packet data');
 return{fixed,lighting,vertex,pixel,kind,count,first,index,base:base|0,max,streams,state,declaration,registers,textures,samplers,textureStages,viewport,scissor};
}
export class DrawRenderer{
 constructor(device,backend){this.device=device;this.backend=backend;this.cache=new PipelineCache(device,backend.shaders);this.samplers=new SamplerCache(device);this.uniformBytes=UNIFORM_STRIDE*UNIFORM_SLOTS;this.uniforms=[0,1].map(stage=>device.createBuffer({label:`D3D9 ${stage?'pixel':'vertex'} uniform ring`,size:this.uniformBytes,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}));this.uniformShadow=[new Uint8Array(this.uniformBytes),new Uint8Array(this.uniformBytes)];this.uniformWords=this.uniformShadow.map(bytes=>new Uint32Array(bytes.buffer));this.pendingUniformBytes=[0,0];this.uniformCursors=[0,0];this.stagingSize=16*1024*1024;this.staging=device.createBuffer({label:'D3D9 dynamic geometry ring',size:this.stagingSize,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST|GPUBufferUsage.VERTEX|GPUBufferUsage.INDEX});this.stagingShadow=new Uint8Array(this.stagingSize);this.stagingCursor=0;this.deferredCopies=[];this.versionedResources=new Set();this.bindingCaches=new WeakMap();this.encoder=null;this.pass=null;this.passState=null;this.writeMetrics={sourceGeometryWrites:0,versionedGeometryWrites:0,versionFallbacks:0,sourceUniformWrites:0,queueWriteCalls:0,queueWriteBytes:0,rendererSubmissions:0,renderPasses:0,uploadPassBreaks:0,stateCalls:0,stateCallsSkipped:0,drawCpuMs:0,pipelineLookupCpuMs:0};}
 setShaderObjects(objects){this.cache.setShaderObjects(objects);}
 draw(packet){
  const timingStart=performance.now();
  const d=this.device,b=this.backend,topology=({1:'point-list',2:'line-list',4:'triangle-list'})[packet.kind];
  const [x,y,width,height,minBits,maxBits]=packet.viewport,minDepth=floatFromBits(minBits),maxDepth=floatFromBits(maxBits);
  if(!width||!height||x+width>b.color.width||y+height>b.color.height||!Number.isFinite(minDepth)||!Number.isFinite(maxDepth)||minDepth<0||maxDepth>1||minDepth>maxDepth)throw RangeError('invalid draw viewport');
  if(!drawScissor(packet,b))throw RangeError('invalid draw scissor');
  const textureStages=packet.textureStages??defaultTextureStages(),textured=!!packet.textures[0]&&textureStages[0][0]!==1;
  const textureDimension=textured?b.textures.get(packet.textures[0]).dimension:1;
  const cached=this.cache.get(packet.vertex,packet.pixel,packet.declaration,packet.streams,packet.state,{topology,fixed:!!packet.fixed,textured,textureDimension,textureStages,lighting:packet.lighting,viewportSize:[width,height]});
  if(b.profileStutters)this.writeMetrics.pipelineLookupCpuMs+=performance.now()-timingStart;
  if(cached?.then)return cached.then(entry=>this.drawWithEntry(packet,entry,timingStart));
 return this.drawWithEntry(packet,cached,timingStart);
 }
 endPass(upload=false){if(this.pass){this.pass.end();this.pass=null;this.passState=null;if(upload)this.writeMetrics.uploadPassBreaks++;}}
 commitDeferredCopies(){if(!this.deferredCopies.length)return;this.encoder??=this.device.createCommandEncoder();for(const {resource,ringOffset,offset,length} of this.deferredCopies)this.encoder.copyBufferToBuffer(this.staging,ringOffset,resource.buffer,offset,length);for(const resource of this.versionedResources)resource.dynamicVersion=null;this.deferredCopies.length=0;this.versionedResources.clear();}
 prepareBufferUpload(upload=false){this.endPass(upload);this.commitDeferredCopies();this.encoder??=this.device.createCommandEncoder();}
 clear(flags,colorValue,z,stencil){
  this.prepareBufferUpload();
  const pass=this.encoder.beginRenderPass({colorAttachments:[{view:this.backend.color.createView(),loadOp:flags&1?'clear':'load',storeOp:'store',clearValue:colorValue}],depthStencilAttachment:{view:this.backend.depth.createView(),depthLoadOp:flags&2?'clear':'load',depthStoreOp:'store',depthClearValue:z,stencilLoadOp:flags&4?'clear':'load',stencilStoreOp:'store',stencilClearValue:stencil}});pass.end();
 }
present(target){
  this.prepareBufferUpload();
  this.encoder.copyTextureToTexture({texture:this.backend.color},{texture:target},[this.backend.width,this.backend.height]);
  this.flush();
 }
 uploadBuffer(resource,offset,data){
  const length=Math.ceil(data.byteLength/4)*4;
  if(length>this.stagingSize)throw RangeError('geometry upload exceeds staging capacity');
  if(this.stagingCursor+length>this.stagingSize)this.flush();
  const ringOffset=this.stagingCursor;this.stagingShadow.set(data,ringOffset);this.writeMetrics.sourceGeometryWrites++;
  resource.dynamicVersion={buffer:this.staging,base:ringOffset,offset,length};this.versionedResources.add(resource);this.deferredCopies.push({resource,ringOffset,offset,length});this.writeMetrics.versionedGeometryWrites++;
  this.stagingCursor+=length;
 }
 stageUniform(stage,offset,data){
  if(![0,1].includes(stage)||!Number.isInteger(offset)||offset<0||offset%4||!(ArrayBuffer.isView(data))||offset+data.byteLength>this.uniformBytes)throw RangeError('invalid uniform staging range');
  this.uniformShadow[stage].set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength),offset);this.pendingUniformBytes[stage]=Math.max(this.pendingUniformBytes[stage],offset+data.byteLength);this.writeMetrics.sourceUniformWrites++;
 }
 packUniform(stage,offset,shader,registers){
  const bytes=shaderUniformByteLength(shader);if(!bytes)return 0;
  if(![0,1].includes(stage)||!Number.isInteger(offset)||offset<0||offset%4||offset+bytes>this.uniformBytes)throw RangeError('invalid uniform staging range');
  packShaderUniformsInto(shader,registers,this.uniformWords[stage],offset/4);this.pendingUniformBytes[stage]=Math.max(this.pendingUniformBytes[stage],offset+bytes);this.writeMetrics.sourceUniformWrites++;return bytes;
 }
 drawWithEntry(packet,entry,timingStart){
  const d=this.device,b=this.backend,[x,y,width,height,minBits,maxBits]=packet.viewport,minDepth=floatFromBits(minBits),maxDepth=floatFromBits(maxBits),[left,top,right,bottom]=drawScissor(packet,b);
  const vertexResources=entry.layout.map(layout=>{const s=packet.streams[layout.stream],resource=b.buffers.get(s.id),extent=Math.max(...layout.attributes.map(a=>a.offset+(a.format==='float32'?1:Number(a.format.at(-1)))*4)),required=s.offset+packet.max*s.stride+extent;if(resource.kind!==6||s.offset%4||required>resource.size)throw RangeError('draw exceeds vertex buffer');return{resource,s,required};});
  let index,indexWidth=0,indexRequired=0,indexStart=0;if(packet.index){index=b.buffers.get(packet.index);indexWidth=index.format===101?2:4;indexStart=packet.first*indexWidth;indexRequired=(packet.first+packet.count)*indexWidth;if(index.kind!==7||indexRequired>index.size)throw RangeError('draw exceeds index buffer');}else if(packet.max!==packet.first+packet.count-1)throw RangeError('invalid nonindexed vertex range');
  const vertexCovered=({resource,s,required})=>!resource.dynamicVersion||(s.offset>=resource.dynamicVersion.offset&&required<=resource.dynamicVersion.offset+resource.dynamicVersion.length),indexCovered=!index?.dynamicVersion||(indexStart>=index.dynamicVersion.offset&&indexRequired<=index.dynamicVersion.offset+index.dynamicVersion.length&&index.dynamicVersion.offset%indexWidth===0);
  if(!vertexResources.every(vertexCovered)||!indexCovered){this.writeMetrics.versionFallbacks++;this.prepareBufferUpload(true);}
  const bindings=vertexResources.map(({resource,s})=>{const version=resource.dynamicVersion,relative=version?s.offset-version.offset:s.offset;return{buffer:version?.buffer??resource.buffer,offset:(version?.base??0)+relative,size:(version?.length??resource.size)-relative};});
  const uniformSizes=[shaderUniformByteLength(entry.shaders.vertex),shaderUniformByteLength(entry.shaders.pixel)];
  const textureEntries=[];
  if(entry.shaders.vertex.samplers.length)throw RangeError('vertex texture sampling unsupported');
  const textureKey=[];
  for(const s of entry.shaders.pixel.samplers){
   const sourceIndex=s.sourceIndex??s.textureBinding;
   if(s.group!==2||![1,3].includes(s.dimension)||sourceIndex>=16||s.textureBinding>=32||s.samplerBinding>=32)throw RangeError('unsupported texture sampler reflection');
   const textureId=packet.textures[sourceIndex],texture=b.textures.get(textureId),samplerState=samplerAt(packet.samplers,sourceIndex);
   if(texture.dimension!==s.dimension)throw RangeError('texture dimension does not match shader sampler');
   textureKey.push(sourceIndex,textureId,...samplerState);
   textureEntries.push({binding:s.textureBinding,resource:texture.view},{binding:s.samplerBinding,resource:this.samplers.get(samplerState,texture.levels)});
  }
  let uniformOffsets=uniformSizes.map((bytes,stage)=>bytes?alignUniform(this.uniformCursors[stage]):0);
  if(uniformSizes.some((bytes,stage)=>bytes&&uniformOffsets[stage]+bytes>this.uniformBytes)){this.flush();uniformOffsets=uniformSizes.map(()=>0);}
  for(let stage=0;stage<2;stage++)if(uniformSizes[stage])this.uniformCursors[stage]=uniformOffsets[stage]+alignUniform(uniformSizes[stage]);
  let bindingCache=this.bindingCaches.get(entry);if(!bindingCache){bindingCache={static:new Map(),uniform:new Map(),textures:new Map()};this.bindingCaches.set(entry,bindingCache);}
  const groups=[],last=uniformSizes[1]?3:textureEntries.length?2:uniformSizes[0]?1:-1;
  for(let group=0;group<=last;group++){
   const stage=group===1?0:group===3?1:-1;
   if(stage>=0&&uniformSizes[stage]){
   const buffer=this.uniforms[stage],offset=uniformOffsets[stage],size=this.packUniform(stage,offset,entry.shaders[stage?'pixel':'vertex'],packet.registers[stage]);
    const key=stage*this.uniformBytes+offset;let bindGroup=bindingCache.uniform.get(key);
    const reflected=entry.shaders[stage?'pixel':'vertex'].uniformBindings;
    const entries=reflected?.length?reflected.map(binding=>({binding:binding.binding,resource:{buffer,offset:offset+binding.offsetBytes,size:binding.sizeBytes}})):[{binding:0,resource:{buffer,offset,size}}];
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
  if(!this.pass){this.encoder??=d.createCommandEncoder();this.pass=this.encoder.beginRenderPass({...(timestampWrites?{timestampWrites}:{}),colorAttachments:[{view:b.color.createView(),loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:b.depth.createView(),depthLoadOp:'load',depthStoreOp:'store',stencilLoadOp:'load',stencilStoreOp:'store'}});this.passState={pipeline:null,viewport:null,scissor:null,stencil:-1,vertices:[],groups:[],index:null};this.writeMetrics.renderPasses++;}
  const pass=this.pass,state=this.passState,call=()=>this.writeMetrics.stateCalls++,skip=()=>this.writeMetrics.stateCallsSkipped++;
  if(!state.viewport||state.viewport[0]!==x||state.viewport[1]!==y||state.viewport[2]!==width||state.viewport[3]!==height||state.viewport[4]!==minDepth||state.viewport[5]!==maxDepth){pass.setViewport(x,y,width,height,minDepth,maxDepth);state.viewport=[x,y,width,height,minDepth,maxDepth];call();}else skip();
  if(!state.scissor||state.scissor[0]!==left||state.scissor[1]!==top||state.scissor[2]!==right||state.scissor[3]!==bottom){pass.setScissorRect(left,top,right-left,bottom-top);state.scissor=[left,top,right,bottom];call();}else skip();
  if(state.pipeline!==entry.pipeline){pass.setPipeline(entry.pipeline);state.pipeline=entry.pipeline;call();}else skip();
  const stencil=packet.state.get(RS.STENCILREF)&255;if(state.stencil!==stencil){pass.setStencilReference(stencil);state.stencil=stencil;call();}else skip();
  bindings.forEach((binding,slot)=>{const previous=state.vertices[slot];if(!previous||previous.buffer!==binding.buffer||previous.offset!==binding.offset||previous.size!==binding.size){pass.setVertexBuffer(slot,binding.buffer,binding.offset,binding.size);state.vertices[slot]=binding;call();}else skip();});
  groups.forEach((group,slot)=>{if(state.groups[slot]!==group){pass.setBindGroup(slot,group);state.groups[slot]=group;call();}else skip();});
  if(index){const format=index.format===101?'uint16':'uint32',version=index.dynamicVersion,indexBinding={buffer:version?.buffer??index.buffer,format,offset:version?.base??0,size:version?.length??index.size},first=version?packet.first-version.offset/indexWidth:packet.first;if(!state.index||state.index.buffer!==indexBinding.buffer||state.index.format!==format||state.index.offset!==indexBinding.offset||state.index.size!==indexBinding.size){pass.setIndexBuffer(indexBinding.buffer,format,indexBinding.offset,indexBinding.size);state.index=indexBinding;call();}else skip();pass.drawIndexed(packet.count,1,first,packet.base,0)}else pass.draw(packet.count,1,packet.first,0);if(b.profileStutters)this.writeMetrics.drawCpuMs+=performance.now()-timingStart;if(timestampWrites){this.flush();b.timer.cpuWallMs+=performance.now()-timingStart;}
 }
 flush(){this.endPass();this.commitDeferredCopies();if(!this.encoder)return;const queue=this.device.queue;if(this.stagingCursor){queue.writeBuffer(this.staging,0,this.stagingShadow.subarray(0,this.stagingCursor));this.writeMetrics.queueWriteCalls++;this.writeMetrics.queueWriteBytes+=this.stagingCursor;}for(let stage=0;stage<2;stage++){const bytes=this.pendingUniformBytes[stage];if(!bytes)continue;queue.writeBuffer(this.uniforms[stage],0,this.uniformShadow[stage].subarray(0,bytes));this.writeMetrics.queueWriteCalls++;this.writeMetrics.queueWriteBytes+=bytes;}queue.submit([this.encoder.finish()]);this.writeMetrics.rendererSubmissions++;this.encoder=null;this.stagingCursor=0;this.uniformCursors.fill(0);this.pendingUniformBytes.fill(0);}
 snapshotMetrics(){return{...this.writeMetrics,pendingGeometryBytes:this.stagingCursor,pendingUniformBytes:[...this.pendingUniformBytes]};}
 dispose(){this.flush();this.cache.dispose();this.samplers.dispose();for(const buffer of this.uniforms)buffer.destroy();this.staging.destroy();}
}
