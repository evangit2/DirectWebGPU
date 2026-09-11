import {InputBroker} from './input-transport.js';

const broker=new InputBroker();
const fail=error=>postMessage({type:'input-error',message:String(error?.stack??error)});
let port;

self.onmessage=({data})=>{
 try{
  if(data.type==='init'){
   if(port)throw Error('input worker already initialized');
   port=data.port;
   if(!port)throw Error('input transport port missing');
   port.onmessage=({data:request})=>{try{broker.request(request.func,request.buffer,request.retAddr)}catch(error){fail(error)}};
   port.start();
   postMessage({type:'input-ready'});
   return;
  }
  if(data.type==='input'){
   if(!broker.push(data.message))throw Error('input queue capacity exceeded');
   return;
  }
  throw Error(`unsupported input worker command: ${data.type}`);
 }catch(error){fail(error)}
};
