// Match D3D declaration semantics to reflected shader input locations.
export function vertexLayout(bytes,inputs,streams){
 if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>520||bytes.length%8)throw Error('invalid vertex declaration bytes');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),elements=new Map();let terminated=false;
 for(let p=0;p<bytes.length;p+=8){
  const stream=view.getUint16(p,true),offset=view.getUint16(p+2,true),type=bytes[p+4],method=bytes[p+5],usage=bytes[p+6],index=bytes[p+7];
  if(stream===255&&offset===0&&type===17&&method===0&&usage===0&&index===0){if(p!==bytes.length-8)throw Error('data after declaration terminator');terminated=true;break}
  if(stream>=16||type>3||method!==0||usage>13||index>15||offset%4||offset+(type+1)*4>2048)throw Error('unsupported vertex element');
  const key=usage+':'+index;if(elements.has(key))throw Error('duplicate vertex semantic');elements.set(key,{stream,offset,type});
 }
 if(!terminated)throw Error('missing declaration terminator');
 const groups=new Map(),locations=new Set();if(!Array.isArray(inputs)||inputs.length>16)throw Error('invalid shader input reflection');
 for(const input of inputs){
  if(!Number.isInteger(input.location)||input.location<0||input.location>=16||locations.has(input.location))throw Error('invalid shader input location');locations.add(input.location);
  const e=elements.get(input.usage+':'+input.index);if(!e)throw Error('declaration missing shader semantic '+input.usage+':'+input.index);
  if(e.type!==3)throw Error('FLOAT1..FLOAT3 shader input expansion not implemented');
  const stride=streams[e.stream]?.stride;if(!Number.isInteger(stride)||stride<e.offset+16||stride>2048||stride%4)throw Error('invalid vertex stream stride');
  if(!groups.has(e.stream))groups.set(e.stream,{stream:e.stream,arrayStride:stride,stepMode:'vertex',attributes:[]});
  groups.get(e.stream).attributes.push({shaderLocation:input.location,offset:e.offset,format:'float32x4'});
 }
 return [...groups.values()].sort((a,b)=>a.stream-b.stream);
}
