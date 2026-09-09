// Device-owned validated bytecode; translation/linking is deferred until draw.
export class ShaderObjects {
 constructor(translator){this.translator=translator;this.objects=new Map();this.nextId=1;this.bytes=0;this.pairs=new Map();this.pairBytes=0;this.translations=0;}
 create(stage,bytes){
  if(![0,1].includes(stage)||!(bytes instanceof Uint8Array)||bytes.length<8||bytes.length>1048576||bytes.length%4)throw RangeError('invalid shader object data');
  const version=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true);
  const legacy=this.translator.mode==='legacy-win32',major=(version>>>8)&255;
  if(legacy?version!==(stage===0?0xfffe0101:0xffff0200):(version>>>16)!==(stage?0xffff:0xfffe)||major<1||major>3)throw RangeError('unsupported shader profile');
  if(this.objects.size>=4096||this.bytes+bytes.length>16*1024*1024||this.nextId>=0x80000000)throw RangeError('shader object budget exhausted');
  const copy=bytes.slice();this.translator.validate(stage,copy);
  const id=this.nextId++;this.objects.set(id,{stage,bytecode:copy});this.bytes+=copy.length;return id;
 }
 get(id,stage){const object=this.objects.get(id);if(!object||object.stage!==stage)throw RangeError('invalid shader handle or stage');return object;}
 pair(vertex,pixel,declaration){
  const vs=this.get(vertex,0),ps=this.get(pixel,1),declarationKey=this.translator.mode==='wined3d-webgpu'?':'+Array.from(declaration??[]).join('.'):'';
  const key=vertex+':'+pixel+declarationKey;
  let cached=this.pairs.get(key);if(cached){this.pairs.delete(key);this.pairs.set(key,cached);return cached.pair;}
  const pair=this.translator.translatePair(vs.bytecode,ps.bytecode,{declaration}),bytes=JSON.stringify(pair).length*2;
  if(bytes>16*1024*1024)throw RangeError('linked shader budget exceeded');
  while(this.pairs.size>=128||this.pairBytes+bytes>16*1024*1024){const oldest=this.pairs.keys().next().value;this.pairBytes-=this.pairs.get(oldest).bytes;this.pairs.delete(oldest);}
  this.pairs.set(key,{pair,bytes,vertex,pixel});this.pairBytes+=bytes;this.translations++;return pair;
 }
 destroy(id){const object=this.objects.get(id);if(!object)throw RangeError('released shader handle');this.bytes-=object.bytecode.length;this.objects.delete(id);for(const [key,pair]of this.pairs){if(pair.vertex===id||pair.pixel===id){this.pairBytes-=pair.bytes;this.pairs.delete(key);}}}
 dispose(){this.objects.clear();this.pairs.clear();this.pairBytes=0;this.bytes=0;}
}
