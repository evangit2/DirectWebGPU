// Transport/lifecycle diagnostic only; never counted as a Humus frame.
export async function testDeviceBridge(){
 const worker=new Worker('/gpu-worker.js',{type:'module'}),channel=new MessageChannel(),events=[];
 const canvas=new OffscreenCanvas(64,64);let error;
 worker.onmessage=({data})=>{events.push(data);if(data.type==='gpu-error')error=data.message};
 try{
  const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('GPU worker init timeout')),10000);channel.port2.onmessage=({data})=>{clearTimeout(timer);data.ready?resolve(data):reject(Error(data.error))};channel.port2.start()});
  worker.postMessage({type:'init',canvas,port:channel.port1},[canvas,channel.port1]);await ready;
  async function rpc(func,args,details=false){
   const buffer=new SharedArrayBuffer(32),words=new Int32Array(buffer);
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
  assert(await rpc('graphics_call',[2,id])===1,'release failed');
  assert(await rpc('graphics_call',[3,id,7,0,0x3f800000,0])===0x8876086c,'released device accepted');
  return{result:'passed',checks:['empty input polling and queued key delivery passed','unsupported device configuration rejected','asynchronous GPU validation wakes blocked-style RPC','color/depth/stencil attachments allocated and cleared','GPU-to-GPU presentation validated','released handle rejected'],diagnosticPresents:1,HumusFrames:0,events};
 }finally{channel.port2.close();worker.terminate()}
}
