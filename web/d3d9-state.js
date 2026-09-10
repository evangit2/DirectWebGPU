// D3D9 render-state values mapped to WebGPU pipeline state. Unsupported state
// changes fail at this boundary; callers must not advertise them as supported.
const compare=[null,'never','less','equal','less-equal','greater','not-equal','greater-equal','always'];
const stencil=[null,'keep','zero','replace','increment-clamp','decrement-clamp','invert','increment-wrap','decrement-wrap'];
const blend=[null,'zero','one','src','one-minus-src','src-alpha','one-minus-src-alpha','dst-alpha','one-minus-dst-alpha','dst','one-minus-dst','src-alpha-saturated'];
const blendOp=[null,'add','subtract','reverse-subtract','min','max'];
export const RS={ZENABLE:7,ZWRITEENABLE:14,ALPHATESTENABLE:15,SRCBLEND:19,DESTBLEND:20,CULLMODE:22,ZFUNC:23,ALPHAREF:24,ALPHAFUNC:25,ALPHABLENDENABLE:27,STENCILENABLE:52,STENCILFAIL:53,STENCILZFAIL:54,STENCILPASS:55,STENCILFUNC:56,STENCILREF:57,STENCILMASK:58,STENCILWRITEMASK:59,CLIPPING:136,COLORWRITEENABLE:168,BLENDOP:171};
const defaults={7:1,14:1,15:0,19:2,20:1,22:3,23:4,24:0,25:8,27:0,52:0,53:1,54:1,55:1,56:8,57:0,58:0xffffffff,59:0xffffffff,136:1,168:15,171:1};
export class D3D9RenderState{
 constructor(){this.values={...defaults};}
 set(type,value){
  if(!Number.isInteger(value)||value<0||value>0xffffffff)throw Error(`invalid D3D9 state value ${value}`);
  if(!Number.isInteger(type)||!Object.hasOwn(defaults,type))throw Error(`unsupported D3D9 render state ${type}`);
  const choices=({7:[0,1],14:[0,1],15:[0,1],27:[0,1],52:[0,1],136:[0,1],22:[1,2,3]})[type];
  if(choices&&!choices.includes(value))throw Error(`unsupported D3D9 render state ${type}=${value}`);
  const table=({19:blend,20:blend,23:compare,25:compare,53:stencil,54:stencil,55:stencil,56:compare,171:blendOp})[type];
  if(table&&!table[value])throw Error(`unsupported D3D9 render state ${type}=${value}`);
  if(type===24&&value>255||type===168&&value>15)throw Error(`invalid D3D9 render state ${type}=${value}`);
  this.values[type]=value;
 }
 get(type){if(!Number.isInteger(type)||!Object.hasOwn(defaults,type))throw Error(`unsupported D3D9 render state ${type}`);return this.values[type]}
 alphaVariant(source,translator){return this.get(RS.ALPHATESTENABLE)?translator.alphaTest(source,this.get(RS.ALPHAFUNC),this.get(RS.ALPHAREF)):source}
 depthStencil(format='depth24plus-stencil8'){
  const s=this.values;const face=s[52]?{compare:compare[s[56]],failOp:stencil[s[53]],depthFailOp:stencil[s[54]],passOp:stencil[s[55]]}:{compare:'always',failOp:'keep',depthFailOp:'keep',passOp:'keep'};
  return {format,depthWriteEnabled:!!(s[7]&&s[14]),depthCompare:s[7]?compare[s[23]]:'always',stencilFront:face,stencilBack:{...face},stencilReadMask:s[58]&255,stencilWriteMask:s[52]?s[59]&255:0};
 }
 colorTarget(format){
  const s=this.values,target={format,writeMask:s[168]};
  if(s[27]){
   const color={operation:blendOp[s[171]],srcFactor:blend[s[19]],dstFactor:blend[s[20]]};
   // WebGPU min/max requires ONE factors; D3D9 ignores factors for these ops.
   if(s[171]>=4)color.srcFactor=color.dstFactor='one';
   target.blend={color,alpha:{...color}};
  }
  return target;
 }
 primitive(topology='triangle-list'){return{topology,frontFace:'ccw',cullMode:['none','back','front'][this.get(RS.CULLMODE)-1]}}
 applyDynamic(pass){pass.setStencilReference(this.get(RS.STENCILREF)&255)}
}
