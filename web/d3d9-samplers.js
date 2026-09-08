// DWORD layout follows D3DSAMPLERSTATETYPE (slot zero unused).
export const defaultSampler=()=>new Uint32Array([0,1,1,1,0,1,1,0,0,0,1,0,0,0]);
export function samplerDescriptor(state,levels){
 if(!(state instanceof Uint32Array)||state.length!==14||!Number.isInteger(levels)||levels<1||levels>13)throw RangeError('invalid sampler state');
 const address=['','repeat','mirror-repeat','clamp-to-edge'];
 if(![1,2,3].includes(state[1])||![1,2,3].includes(state[2])||![1,2,3].includes(state[3])||![1,2].includes(state[5])||![1,2].includes(state[6])||state[7]>2||state[8]!==0||state[9]>12||state[10]!==1||state[11]!==0||state[12]!==0||state[13]!==0)throw RangeError('unsupported sampler state');
 const min=Math.min(state[9],levels-1);
 return {addressModeU:address[state[1]],addressModeV:address[state[2]],addressModeW:address[state[3]],magFilter:state[5]===2?'linear':'nearest',minFilter:state[6]===2?'linear':'nearest',mipmapFilter:state[7]===2?'linear':'nearest',lodMinClamp:min,lodMaxClamp:state[7]===0?min:levels-1,maxAnisotropy:1};
}
export class SamplerCache{
 constructor(device){this.device=device;this.items=new Map();}
 get(state,levels){const descriptor=samplerDescriptor(state,levels),key=JSON.stringify(descriptor);let sampler=this.items.get(key);if(sampler){this.items.delete(key);this.items.set(key,sampler);return sampler}sampler=this.device.createSampler(descriptor);if(this.items.size>=512)this.items.delete(this.items.keys().next().value);this.items.set(key,sampler);return sampler;}
 dispose(){this.items.clear();}
}
