// Device-owned validated bytecode; translation/linking is deferred until draw.
export class ShaderObjects {
 constructor(translator){this.translator=translator;this.objects=new Map();this.nextId=1;this.bytes=0;}
 create(stage,bytes){
  if(![0,1].includes(stage)||!(bytes instanceof Uint8Array)||bytes.length<8||bytes.length>1048576||bytes.length%4)throw RangeError('invalid shader object data');
  const version=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true);
  if(version!==(stage===0?0xfffe0101:0xffff0200))throw RangeError('unsupported shader profile');
  if(this.objects.size>=4096||this.bytes+bytes.length>16*1024*1024||this.nextId>=0x80000000)throw RangeError('shader object budget exhausted');
  const copy=bytes.slice();this.translator.validate(stage,copy);
  const id=this.nextId++;this.objects.set(id,{stage,bytecode:copy});this.bytes+=copy.length;return id;
 }
 get(id,stage){const object=this.objects.get(id);if(!object||object.stage!==stage)throw RangeError('invalid shader handle or stage');return object;}
 pair(vertex,pixel){return this.translator.translatePair(this.get(vertex,0).bytecode,this.get(pixel,1).bytecode);}
 destroy(id){const object=this.objects.get(id);if(!object)throw RangeError('released shader handle');this.bytes-=object.bytecode.length;this.objects.delete(id);}
 dispose(){this.objects.clear();this.bytes=0;}
}
