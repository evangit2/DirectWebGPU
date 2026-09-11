// Opt-in diagnostic only. Render application commands to a separate target,
// omitting colorless alpha/stencil masks and removing stencil from lighting.
// This tests the demo's optimization invariant, not native D3D9 conformance.
import {DrawRenderer} from './d3d9-draw.js';
import {D3D9RenderState,RS} from './d3d9-state.js';
export function compareSceneBytes(a,b,width,height,pitch){
 let pixels=0,differentPixels=0,maxChannelError=0,totalError=0,nonblack=0;
 for(let y=64;y<height;y++)for(let x=0;x<width;x++){let changed=false;const p=y*pitch+x*4;pixels++;if(Math.max(a[p],a[p+1],a[p+2])>12)nonblack++;for(let c=0;c<3;c++){const error=Math.abs(a[p+c]-b[p+c]);if(error)changed=true;maxChannelError=Math.max(maxChannelError,error);totalError+=error;}if(changed)differentPixels++;}
 return {pixels,nonblackPixels:nonblack,differentPixels,maxChannelError,meanAbsoluteChannelError:totalError/(pixels*3)};
}
export class SceneEquivalence {
 constructor(device,backend,omitLighting=false){this.omitLighting=omitLighting;this.device=device;this.original=backend;this.counts={maskDraws:0,lightingDraws:0,otherDraws:0};this.done=false;}
 async ensure(){if(this.reference)return;const d=this.device,b=this.original;
  const color=d.createTexture({size:[b.width,b.height],format:'bgra8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  const depth=d.createTexture({size:[b.width,b.height],format:'depth24plus-stencil8',usage:GPUTextureUsage.RENDER_ATTACHMENT});
  this.reference={...b,color,depth,targetColor:{texture:color,view:color.createView(),width:b.width,height:b.height,format:'bgra8unorm',textureId:0,stencil:false},targetDepth:{texture:depth,view:depth.createView(),width:b.width,height:b.height,format:'depth24plus-stencil8',textureId:0,stencil:true},timer:null};this.renderer=new DrawRenderer(d,this.reference);this.clear(7,{r:0,g:0,b:0,a:0},1,0);
 }
 clear(flags,color,z,stencil){if(!this.reference||this.done)return;this.renderer?.flush();const d=this.device,b=this.reference,e=d.createCommandEncoder();const p=e.beginRenderPass({colorAttachments:[{view:b.color.createView(),loadOp:flags&1?'clear':'load',storeOp:'store',clearValue:color}],depthStencilAttachment:{view:b.depth.createView(),depthLoadOp:flags&2?'clear':'load',depthStoreOp:'store',depthClearValue:z,stencilLoadOp:flags&4?'clear':'load',stencilStoreOp:'store',stencilClearValue:stencil}});p.end();d.queue.submit([e.finish()]);}
 // The diagnostic renderer shares application textures and geometry. Submit
 // its pending references before the guest uploads to or releases a resource.
 flush(){if(!this.done)this.renderer?.flush();}
 async draw(packet){if(this.done)return;await this.ensure();const s=packet.state;
  if(s.get(RS.STENCILENABLE)&&s.get(RS.ALPHATESTENABLE)&&s.get(RS.COLORWRITEENABLE)===0){if(s.get(RS.ZWRITEENABLE))throw Error('equivalence mask unexpectedly writes depth');this.counts.maskDraws++;return;}
  let state=s;
  if(s.get(RS.STENCILENABLE)){if(s.get(RS.STENCILFUNC)!==3||s.get(RS.ALPHATESTENABLE))throw Error('equivalence unexpected stencil lighting state');state=new D3D9RenderState();for(const [k,v] of Object.entries(s.values))state.set(Number(k),v);state.set(RS.STENCILENABLE,0);this.counts.lightingDraws++;if(this.omitLighting)return;}else this.counts.otherDraws++;
  await this.renderer.draw({...packet,state});
 }
 async compare(present){if(this.done||![1,30,60].includes(present))return null;
  this.flush();const d=this.device,b=this.original,width=b.width,height=b.height,pitch=Math.ceil(width*4/256)*256;
  const reads=[0,1].map(()=>d.createBuffer({size:pitch*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}));
  try{const e=d.createCommandEncoder();[b.color,this.reference.color].forEach((texture,i)=>e.copyTextureToBuffer({texture},{buffer:reads[i],bytesPerRow:pitch},[width,height]));d.queue.submit([e.finish()]);await Promise.all(reads.map(r=>r.mapAsync(GPUMapMode.READ)));
   const bytes=reads.map(r=>new Uint8Array(r.getMappedRange()));const stats=compareSceneBytes(...bytes,width,height,pitch);const hashes=await Promise.all(bytes.map(async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('')));
   return {present,width,height,negativeControl:this.omitLighting?'omit lighting on diagnostic target only':null,sceneY:64,...stats,counts:{...this.counts},fullBufferSha256:{original:hashes[0],unmaskedDiagnostic:hashes[1]},meaning:'Same original shaders/geometry/constants; separate target with colorless mask passes omitted and lighting stencil disabled. RGB comparison excludes top 64 rows. Not an independent native reference.'};
  }finally{reads.forEach(r=>r.destroy());if(present===60)this.dispose();}
 }
 dispose(){if(this.done)return;this.renderer?.dispose();this.reference?.color.destroy();this.reference?.depth.destroy();this.done=true;}
}
