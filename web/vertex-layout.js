// Match D3D declaration semantics to reflected shader input locations.
const FORMATS=[
 ['float32',4],['float32x2',8],['float32x3',12],['float32x4',16],
 ['unorm8x4',4],['uint8x4',4],['sint16x2',4],['sint16x4',8],
 ['unorm8x4',4],['snorm16x2',4],['snorm16x4',8],['unorm16x2',4],
 ['unorm16x4',8],null,null,['float16x2',4],['float16x4',8]
];
export function vertexLayout(bytes,inputs,streams){
 if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>520||bytes.length%8)throw Error('invalid vertex declaration bytes');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),elements=new Map();let terminated=false;
 for(let p=0;p<bytes.length;p+=8){
  const stream=view.getUint16(p,true),offset=view.getUint16(p+2,true),type=bytes[p+4],method=bytes[p+5],usage=bytes[p+6],index=bytes[p+7];
  if(stream===255&&offset===0&&type===17&&method===0&&usage===0&&index===0){if(p!==bytes.length-8)throw Error('data after declaration terminator');terminated=true;break}
  const format=FORMATS[type];
  if(stream>=16||!format||method!==0||usage>13||index>15||offset%4||offset+format[1]>2048)throw Error('unsupported vertex element');
  const key=usage+':'+index;if(elements.has(key))throw Error('duplicate vertex semantic');elements.set(key,{stream,offset,type,format:format[0],width:format[1]});
 }
 if(!terminated)throw Error('missing declaration terminator');
 const groups=new Map(),locations=new Set();if(!Array.isArray(inputs)||inputs.length>16)throw Error('invalid shader input reflection');
 for(const input of inputs){
  if(!Number.isInteger(input.location)||input.location<0||input.location>=16||locations.has(input.location))throw Error('invalid shader input location');locations.add(input.location);
  const e=elements.get(input.usage+':'+input.index);if(!e)throw Error('declaration missing shader semantic '+input.usage+':'+input.index);
  const stride=streams[e.stream]?.stride;if(!Number.isInteger(stride)||stride<e.offset+e.width||stride>2048||stride%4)throw Error('invalid vertex stream stride');
  if(!groups.has(e.stream))groups.set(e.stream,{stream:e.stream,arrayStride:stride,stepMode:'vertex',attributes:[]});
  groups.get(e.stream).attributes.push({shaderLocation:input.location,offset:e.offset,format:e.format});
 }
 return [...groups.values()].sort((a,b)=>a.stream-b.stream);
}

export function vertexWidths(layout){
 const widths=new Uint32Array(16);
 for(const group of layout)for(const a of group.attributes)widths[a.shaderLocation]=a.format==='float32'?1:Number(a.format.at(-1));
 return widths;
}
