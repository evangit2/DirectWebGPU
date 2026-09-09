// Explicit diagnostic mode: sample three original draw packets, never per frame.
export async function captureDraw(device,backend,packet){
 const pair=packet.fixed?null:backend.shaders.pair(packet.vertex,packet.pixel);
 const geometry=[];
 for(const [slot,s] of packet.streams.entries())if(s.id){
  const b=backend.buffers.get(s.id),length=Math.min(512,b.padded-s.offset),read=device.createBuffer({size:length,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{const enc=device.createCommandEncoder();enc.copyBufferToBuffer(b.buffer,s.offset,read,0,length);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const raw=new Uint8Array(read.getMappedRange());const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);const float32=[];for(let vertex=0;vertex<Math.min(6,Math.floor(raw.byteLength/s.stride));vertex++){const values=[];for(let offset=0;offset+4<=s.stride;offset+=4)values.push(view.getFloat32(vertex*s.stride+offset,true));float32.push(values)}geometry.push({slot,stride:s.stride,bytes:Array.from(raw),float32});read.unmap();}finally{read.destroy();}
 }
 const textureInfo=Array.from(packet.textures.slice(0,4)).map(id=>{if(!id)return null;const t=backend.textures.get(id);return{id,width:t.width,height:t.height,format:t.format,levels:t.levels}});
 return{fixed:Boolean(packet.fixed),vertex:packet.vertex,pixel:packet.pixel,kind:packet.kind,count:packet.count,base:packet.base,max:packet.max,state:packet.state.values,declaration:Array.from(packet.declaration),textures:Array.from(packet.textures.slice(0,4)),textureInfo,samplers:packet.samplers.slice(0,2).map(s=>Array.from(s)),viewport:Array.from(packet.viewport),registers:packet.registers.map(r=>Array.from(r[0].slice(0,64))),geometry,pair};
}
