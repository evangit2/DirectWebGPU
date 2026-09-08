// Explicit diagnostic mode: sample three original draw packets, never per frame.
export async function captureDraw(device,backend,packet){
 const pair=packet.fixed?null:backend.shaders.pair(packet.vertex,packet.pixel);
 const geometry=[];
 for(const [slot,s] of packet.streams.entries())if(s.id){
  const b=backend.buffers.get(s.id),length=Math.min(512,b.padded-s.offset),read=device.createBuffer({size:length,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{const enc=device.createCommandEncoder();enc.copyBufferToBuffer(b.buffer,s.offset,read,0,length);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);geometry.push({slot,stride:s.stride,bytes:Array.from(new Uint8Array(read.getMappedRange()))});read.unmap();}finally{read.destroy();}
 }
 return{vertex:packet.vertex,pixel:packet.pixel,kind:packet.kind,count:packet.count,base:packet.base,max:packet.max,state:packet.state.values,declaration:Array.from(packet.declaration),registers:packet.registers.map(r=>Array.from(r[0].slice(0,64))),geometry,pair};
}
