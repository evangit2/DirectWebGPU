// D3DCAPS9's 76 DWORD ABI fields. This is the compatibility device profile,
// not the physical adapter identity or a claim of full D3D9 conformance.
export function deviceCaps(){
 const c=new Uint32Array(76),f=(index,value)=>{c[index]=new Uint32Array(new Float32Array([value]).buffer)[0]};
 c[0]=1; // HAL: shader execution and rasterization use the browser GPU.
 c[3]=0x20000000; // Dynamic textures.
 c[5]=1; // Presentation interval ONE.
 c[7]=0x80000|0x200; // Rasterization and GPU-resident textures.
 c[8]=0x2|0x10|0x20|0x40|0x80|0x800; // Z mask, culling, color mask, blend ops.
 c[9]=0x10|0x400000; // Z testing and perspective color interpolation.
 c[10]=c[13]=0xff; // Eight depth and alpha comparisons.
 c[11]=0x7ff;c[12]=0x3ff; // Blend factors ZERO through SRCALPHASAT.
 c[15]=0x1|0x4|0x40|0x800|0x4000|0x10000|0x20000; // Perspective, alpha, repeat, mipmapped 2D/cube textures.
 c[16]=0x100|0x200|0x10000|0x20000|0x1000000|0x2000000;
 c[17]=c[16]; // Cube textures use the same point/linear/mip filters.
 c[19]=0x1|0x2|0x4|0x10; // Wrap/mirror/clamp, independent UV.
 c[21]=0x1|0x2|0x4|0x8;
 c[22]=c[23]=4096;c[25]=8192;c[26]=4096;c[27]=1;f(28,1e10);
 c[34]=0xff; // Single-sided stencil operations; no two-sided state.
 c[38]=8;f(44,1);c[45]=349525;c[46]=0xffffff;c[47]=8;c[48]=2048;
 c[49]=0xfffe0101;c[50]=256;c[51]=0xffff0200;
 c[53]=1;c[58]=1;c[60]=1; // Stream offsets, one adapter and one render target.
 c[68]=12;c[70]=96; // PS2.0 baseline temporary registers/instruction slots.
 c[72]=128;c[73]=96;
 return c;
}
export function supportsFormat(device,usage,kind,format){
 if(kind===1)return usage===1&&[21,22].includes(format)||usage===2&&format===75;
 if(![3,5].includes(kind)||![0,0x200].includes(usage))return false;
 return [20,21,22,23,24,25,26,28,29,50].includes(format)||device.features.has('texture-compression-bc')&&[0x31545844,0x33545844,0x35545844].includes(format);
}
