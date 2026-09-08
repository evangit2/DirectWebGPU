import {vertexLayout,vertexWidths} from './vertex-layout.js';
import {GeometryBuffers} from './gpu-buffers.js';
export async function testCompactInputs(device,translator,shaders){
 const results=[],storage=new GeometryBuffers(device);
 try{
  for(let count=1;count<=3;count++){
   const stride=(3+count)*4,bytes=new Uint8Array([0,0,0,0,2,0,0,0, 0,0,12,0,count-1,0,10,0, 255,0,0,0,17,0,0,0]);
   const layout=vertexLayout(bytes,shaders.vertex.inputs,[{stride}]);
   const source=translator.vertexInputs(shaders.vertex.wgsl,vertexWidths(layout));
   const values=[];for(const p of [[-.8,-.8,.5],[.8,-.8,.5],[0,.8,.5]])values.push(...p,...[.25,.5,.75].slice(0,count));
   const memory=new SharedArrayBuffer(8192);new Float32Array(memory,4096,values.length).set(values);
   const id=await storage.create(6,values.length*4,100);await storage.upload(id,0,memory,4096,values.length*4);
   const target=device.createTexture({size:[32,32],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
   const read=device.createBuffer({size:32*256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});let scope=true;device.pushErrorScope('validation');
   try{
    const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:device.createShaderModule({code:source}),entryPoint:'main',buffers:layout.map(({stream,...rest})=>rest)},fragment:{module:device.createShaderModule({code:shaders.pixel.wgsl}),entryPoint:'main',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}});
    const enc=device.createCommandEncoder(),pass=enc.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});pass.setPipeline(pipeline);pass.setVertexBuffer(0,storage.get(id).buffer);pass.draw(3);pass.end();enc.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:256},[32,32]);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);
    const center=Array.from(new Uint8Array(read.getMappedRange(),16*256+16*4,4));read.unmap();
    const error=await device.popErrorScope();scope=false;if(error)throw Error(error.message);
    const expected=[64,count>=2?128:0,count>=3?191:0,255];if(center.join(',')!==expected.join(','))throw Error('FLOAT'+count+' input expansion mismatch: '+center);
    results.push({colorComponents:count,positionComponents:3,centerRGBA:center});
   }finally{if(scope)await device.popErrorScope();target.destroy();read.destroy();storage.destroy(id)}
  }
  return{result:'passed',cases:results,draws:3,HumusFrames:0};
 }finally{storage.dispose()}
}
