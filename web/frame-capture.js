// Opt-in sampled evidence, separate from the ordinary presentation path.
export async function captureFrame(device,color,present,startEpoch=performance.timeOrigin){
 const width=color.width,height=color.height,pitch=Math.ceil(width*4/256)*256;
 if(width>4096||height>4096)throw Error('capture dimension limit');
 const read=device.createBuffer({size:pitch*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 try{
  const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture:color},{buffer:read,bytesPerRow:pitch},[width,height]);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
  const readbackCompletedMs=performance.timeOrigin+performance.now()-startEpoch;
  const mapped=new Uint8Array(read.getMappedRange()),rgba=new Uint8ClampedArray(width*height*4);let nonblack=0,pixels=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const s=y*pitch+x*4,t=(y*width+x)*4;rgba[t]=mapped[s+2];rgba[t+1]=mapped[s+1];rgba[t+2]=mapped[s];rgba[t+3]=255;if(y>=64){pixels++;if(Math.max(rgba[t],rgba[t+1],rgba[t+2])>12)nonblack++;}}
  read.unmap();const source=new OffscreenCanvas(width,height);source.getContext('2d').putImageData(new ImageData(rgba,width,height),0,0);
  const output=new OffscreenCanvas(320,Math.round(height*320/width));output.getContext('2d').drawImage(source,0,0,output.width,output.height);
  const blob=await output.convertToBlob({type:'image/jpeg',quality:.8}),bytes=new Uint8Array(await blob.arrayBuffer());if(bytes.length>50000)throw Error('capture image budget');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return{present,readbackCompletedMs,timingMeaning:"upper bound on frame availability from GPU readback completion; includes readback overhead",width,height,evidenceWidth:output.width,evidenceHeight:output.height,sceneRegion:{x:0,y:64,width,height:height-64,nonblackPixels:nonblack,pixels},jpegBase64:btoa(binary)};
 }finally{read.destroy();}
}
