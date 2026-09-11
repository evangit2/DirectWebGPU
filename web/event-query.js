function completionWords(memory,pointer){
 if(!(memory instanceof SharedArrayBuffer)||!Number.isInteger(pointer)||pointer<4096||pointer%4||pointer+4>memory.byteLength)throw RangeError('invalid event-query completion pointer');
 return new Int32Array(memory);
}
function flushRenderer(backend){backend.draws?.flush();backend.equivalence?.flush();}

// Insert a nonblocking marker after all WebGPU work submitted so far. The
// translated CPU polls the shared completion word through IDirect3DQuery9.
export function issueEventQuery(device,backend,memory,pointer,onError=()=>{}){
 const words=completionWords(memory,pointer);flushRenderer(backend);
 device.queue.onSubmittedWorkDone().then(()=>{Atomics.store(words,pointer/4,1);Atomics.notify(words,pointer/4,1);}).catch(onError);
 return 1;
}

// D3DGETDATA_FLUSH drains queued work and resolves the same completion word.
export async function flushEventQuery(device,backend,memory,pointer){
 const words=completionWords(memory,pointer);flushRenderer(backend);
 await device.queue.onSubmittedWorkDone();
 Atomics.store(words,pointer/4,1);Atomics.notify(words,pointer/4,1);
 return 1;
}
