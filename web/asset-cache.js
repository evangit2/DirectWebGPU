const PREFIX='humus-verified-assets-v1-';
export class AssetCache{
 constructor(mode,entries,storage,fetcher,origin){
  if(!['off','cold','warm'].includes(mode))throw Error('invalid asset cache mode');
  const total=entries.reduce((n,e)=>n+e.bytes,0);if(entries.some(e=>!Number.isSafeInteger(e.bytes)||e.bytes<0||!/^[a-f0-9]{64}$/.test(e.sha256))||entries.length>4096||total>512*1024*1024)throw Error(`asset cache budget exceeded: entries=${entries.length} bytes=${total}`);
  this.mode=mode;this.entries=new Map(entries.map(e=>[e.url,e]));this.storage=storage;this.fetcher=fetcher;this.origin=origin;this.stats={mode,hits:0,misses:0,cacheBytes:0,networkBodyBytes:0,verifiedBytes:0,repairedEntries:0,limitBytes:512*1024*1024,scope:'guest assets and executable WASM only; JS modules, shader runtime, browser compilation and OS caches excluded'};
 }
 async open(buildHash){
  if(!/^[a-f0-9]{64}$/.test(buildHash))throw Error('invalid cache build identity');
  if(this.mode==='off')return;
  const name=PREFIX+buildHash;
  for(const key of await this.storage.keys())if(key.startsWith(PREFIX)&&(this.mode==='cold'||key!==name))await this.storage.delete(key);
  this.cache=await this.storage.open(name);
  const allowed=new Set([...this.entries].map(([url,e])=>{const key=new URL(url,this.origin);key.searchParams.set('sha256',e.sha256);return key.href;}));
  for(const request of await this.cache.keys())if(!allowed.has(request.url))await this.cache.delete(request.url);
 }
 async valid(bytes,entry){if(bytes.byteLength!==entry.bytes)return false;const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')===entry.sha256;}
 async load(url){
  const entry=this.entries.get(url);if(!entry)throw Error('asset absent from cache manifest');
  const key=new URL(url,this.origin);key.searchParams.set('sha256',entry.sha256);let bytes;
  const cached=await this.cache?.match(key.href);
  if(cached){bytes=await cached.arrayBuffer();if(await this.valid(bytes,entry)){this.stats.hits++;this.stats.cacheBytes+=bytes.byteLength;}else{await this.cache.delete(key.href);this.stats.repairedEntries++;bytes=null;}}
  if(!bytes){const response=await this.fetcher(url,{cache:'no-store'});if(!response.ok)throw Error('asset HTTP '+response.status);bytes=await response.arrayBuffer();if(!await this.valid(bytes,entry))throw Error('asset integrity mismatch: '+url);this.stats.misses++;this.stats.networkBodyBytes+=bytes.byteLength;if(this.cache)await this.cache.put(key.href,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));}
  this.stats.verifiedBytes+=bytes.byteLength;return bytes;
 }
}
