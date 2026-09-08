import {diagnosticDrawPacket} from './draw-test.js';
import {decodeDraw} from './d3d9-draw.js';
export async function testFixed(device,renderer,buffers,textures,color,read,memory,texture){
 const data=new Float32Array([-.4,-.4,.5,.25,.5,.75,0,0,0, .4,-.4,.5,.25,.5,.75,0,1,0, 0,.4,.5,.25,.5,.75,0,.5,1]);
 new Uint8Array(memory,4096,data.byteLength).set(new Uint8Array(data.buffer));const vb=await buffers.create(6,data.byteLength,100);await buffers.upload(vb,0,memory,4096,data.byteLength);
 const old=new Uint32Array(diagnosticDrawPacket(0,0,vb,0,texture).buffer),decl=[0,0,0,0,2,0,0,0,0,0,12,0,3,0,10,0,0,0,28,0,1,0,5,0,255,0,0,0,17,0,0,0],at=11+48+40;
 const words=[...old.slice(0,at),...new Uint32Array(new Uint8Array(decl).buffer),...old.slice(at+6)];words[9]=32;words[13]=36;
 const matrix=new Float32Array(48);for(let m=0;m<3;m++)for(let i=0;i<4;i++)matrix[m*16+i*5]=1;
 // Three non-identity matrices: world x translation .2, view .1, projection x scale 2.
 matrix[12]=.2;matrix[28]=.1;matrix[32]=2;
 words.push(...new Uint32Array(matrix.buffer));const payload=new Uint32Array(words);new Uint32Array(memory,4096,payload.length).set(payload);
 const packet=decodeDraw(memory,4096,payload.byteLength);
 const enc=device.createCommandEncoder(),pass=enc.beginRenderPass({colorAttachments:[{view:color.createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});pass.end();device.queue.submit([enc.finish()]);
 await renderer.draw(packet);
 const copy=device.createCommandEncoder();copy.copyTextureToBuffer({texture:color},{buffer:read,bytesPerRow:256},[32,32]);device.queue.submit([copy.finish()]);await read.mapAsync(GPUMapMode.READ);const mapped=read.getMappedRange();const result=[16,26].map(x=>Array.from(new Uint8Array(mapped,16*256+x*4,4)));read.unmap();
 if(result[0].join(',')!=='0,0,0,255'||result[1].some((v,i)=>Math.abs(v-[175,61,4,255][i])>1))throw Error('fixed-function matrix/texture/color mismatch '+JSON.stringify(result));
 // Alpha testing uses the same discard compiler as programmable draws.
 packet.state.set(15,1);packet.state.set(25,5);packet.state.set(24,255);await renderer.draw(packet);
 buffers.destroy(vb);return{result:'passed',outsideInsideBGRA:result,checks:['three transform matrices applied in order','texture RGB multiplied by diffuse','texture alpha independent of diffuse alpha','fixed-function alpha-test pipeline compiled']};
}
