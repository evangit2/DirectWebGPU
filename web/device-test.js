import {diagnosticDrawPacket} from './draw-test.js';
// Transport/lifecycle diagnostic only; never counted as a Humus frame.
export async function testDeviceBridge(){
 const worker=new Worker('/gpu-worker.js',{type:'module'}),channel=new MessageChannel(),events=[];
 const canvas=new OffscreenCanvas(64,64);let error;
 worker.onmessage=({data})=>{events.push(data);if(data.type==='gpu-error')error=data.message};
 try{
  const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('GPU worker init timeout')),10000);channel.port2.onmessage=({data})=>{clearTimeout(timer);data.ready?resolve(data):reject(Error(data.error))};channel.port2.start()});
  worker.postMessage({type:'init',canvas,port:channel.port1},[canvas,channel.port1]);await ready;
  async function rpc(func,args,details=false,payload){
   const buffer=new SharedArrayBuffer(32768),words=new Int32Array(buffer);
   if(payload)new Uint8Array(buffer,4096,payload.length).set(payload);
   channel.port2.postMessage({func,args,buffer,retAddr:4});
   const wait=Atomics.waitAsync(words,1,0,10000);await wait.value;
   const result=Atomics.load(words,1)>>>0;if(!result)throw Error('GPU RPC timed out');if(error)throw Error(error);return details?Array.from(words.slice(1,5)):result;
  }
  const assert=(condition,message)=>{if(!condition)throw Error(message)};
  assert(await rpc('create_window',['device diagnostic',64,64])===1,'window creation failed');
  assert(await rpc('poll_message',[])===0xffffffff,'empty input poll should return no event');
  const inputWait=rpc('wait_message',[],true);worker.postMessage({type:'input',message:[5,17,87,0]});
  assert((await inputWait).join(',')==='5,17,87,0','input wait did not deliver the queued key');
  const params=[64,64,21,1,0,0,1,0,1,1,75,0,0,0x80000000];
  const invalid=[...params];invalid[4]=8;
  assert(await rpc('graphics_call',[1,...invalid])===0x8876086a,'unsupported multisampling should fail');
  const id=await rpc('graphics_call',[1,...params]);assert(id>0&&id<0x80000000,'device allocation failed');
  assert(await rpc('graphics_call',[3,id,7,0xff336699,0x3f800000,3])===1,'clear failed');
  assert(await rpc('graphics_call',[4,id])===1,'GPU presentation failed');
  const vb=await rpc('graphics_call',[5,id,6,14,100]);assert(vb>0&&vb<0x80000000,'vertex buffer creation failed');
  assert(await rpc('graphics_call',[6,id,vb,0,4096,16])===1,'shared-memory buffer upload failed');
  assert(await rpc('graphics_call',[6,id,vb,12,4096,8])===0x8876086c,'out-of-bounds upload accepted');
  assert(await rpc('graphics_call',[7,id,vb])===1,'buffer release failed');
  assert(await rpc('graphics_call',[7,id,vb])===0x8876086c,'stale buffer accepted');
  const texture=await rpc('graphics_call',[10,id,8,8,0,21]);assert(texture>0&&texture<0x80000000,'texture creation RPC failed');
  assert(await rpc('graphics_call',[11,id,texture,3,4096,4,4])===1,'small mip texture upload RPC failed');
  assert(await rpc('graphics_call',[11,id,texture,4,4096,4,4])===0x8876086c,'invalid mip RPC accepted');
  assert(await rpc('graphics_call',[12,id,texture])===1,'texture release RPC failed');
  assert(await rpc('graphics_call',[12,id,texture])===0x8876086c,'stale texture RPC accepted');
  const shaderBytes=new Uint8Array(await(await fetch('/generated/vertexExplicit.bin')).arrayBuffer());
  const shader=await rpc('graphics_call',[8,id,0,4096,shaderBytes.length],false,shaderBytes);assert(shader>0&&shader<0x80000000,'shader creation RPC failed');
  assert(await rpc('graphics_call',[8,id,1,4096,shaderBytes.length],false,shaderBytes)===0x8876086c,'wrong-stage shader RPC accepted');
  const ps=new Uint8Array(await(await fetch('/generated/pixel.bin')).arrayBuffer()),pixel=await rpc('graphics_call',[8,id,1,4096,ps.length],false,ps);
  const vertices=new Float32Array([-.8,-.8,.5,1,1,0,0,1,.8,-.8,.5,1,0,1,0,1,0,.8,.5,1,0,0,1,1]),drawVB=await rpc('graphics_call',[5,id,6,vertices.byteLength,100]);
  assert(await rpc('graphics_call',[6,id,drawVB,0,4096,vertices.byteLength],false,new Uint8Array(vertices.buffer))===1,'draw vertex upload failed');
  const packet=diagnosticDrawPacket(shader,pixel,drawVB);assert(await rpc('graphics_call',[13,id,4096,packet.length],false,packet)===1,'draw RPC failed');
  assert(await rpc('graphics_call',[13,id,4096,packet.length-4],false,packet)===0x8876086c,'truncated draw RPC accepted');
  assert(await rpc('graphics_call',[7,id,drawVB])===1,'draw VB release failed');assert(await rpc('graphics_call',[9,id,pixel])===1,'draw PS release failed');
  assert(await rpc('graphics_call',[9,id,shader])===1,'shader release RPC failed');assert(await rpc('graphics_call',[9,id,shader])===0x8876086c,'stale shader RPC accepted');
  assert(await rpc('graphics_call',[2,id])===1,'release failed');
  assert(await rpc('graphics_call',[3,id,7,0,0x3f800000,0])===0x8876086c,'released device accepted');
  return{result:'passed',checks:['draw packet RPC submitted GPU work and rejected truncation','texture RPC allocation, mip upload, bounds and lifetime passed','shader RPC validation and lifetime passed','buffer RPC allocation/upload/bounds/lifetime passed','empty input polling and queued key delivery passed','unsupported device configuration rejected','asynchronous GPU validation wakes blocked-style RPC','color/depth/stencil attachments allocated and cleared','GPU-to-GPU presentation validated','released handle rejected'],diagnosticPresents:1,HumusFrames:0,events};
 }finally{channel.port2.close();worker.terminate()}
}
