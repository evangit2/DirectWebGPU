/* Dedicated libopenmpt decoder worker.  Kept off the render and UI threads. */
let resolveRuntime, rejectRuntime;
const runtime = new Promise((resolve, reject) => {
  resolveRuntime = resolve;
  rejectRuntime = reject;
});
self.libopenmpt = {
  locateFile: name => new URL(`./third_party/libopenmpt/${name}`, self.location.href).href,
  onRuntimeInitialized: () => resolveRuntime(self.libopenmpt),
  onAbort: reason => rejectRuntime(Error(String(reason))),
};
importScripts('./third_party/libopenmpt/libopenmpt.js');

const tracks = new Map();
const LOOP = 4;

function requireTrack(id) {
  const track = tracks.get(id);
  if (!track) throw Error(`unknown tracker music handle ${id}`);
  return track;
}

function destroy(module, track) {
  if (track.output) module._free(track.output);
  module._openmpt_module_destroy(track.module);
}

function load(module, message) {
  const {id, data, flags = 0} = message;
  if (!Number.isInteger(id) || id < 1 || !(data instanceof ArrayBuffer) || !data.byteLength) {
    throw Error('invalid tracker music load');
  }
  if (tracks.has(id)) destroy(module, tracks.get(id));
  const input = module._malloc(data.byteLength);
  if (!input) throw Error('libopenmpt input allocation failed');
  module.HEAPU8.set(new Uint8Array(data), input);
  const handle = module._openmpt_module_create_from_memory(input, data.byteLength, 0, 0, 0);
  module._free(input);
  if (!handle) throw Error('libopenmpt rejected tracker music data');
  module._openmpt_module_set_repeat_count(handle, flags & LOOP ? -1 : 0);
  tracks.set(id, {module: handle, flags, playing: false, output: 0, outputFrames: 0});
  postMessage({type: 'loaded', id});
}

function play(module, message) {
  const track = requireTrack(message.id);
  track.flags = message.flags >>> 0;
  module._openmpt_module_set_repeat_count(track.module, track.flags & LOOP ? -1 : 0);
  const position = message.start >>> 0;
  if (message.restart || position) {
    const order = position & 0xffff, row = position >>> 16;
    module._openmpt_module_set_position_order_row(track.module, order, row);
  }
  track.playing = true;
  postMessage({type: 'playing', id: message.id});
}

function render(module, message) {
  const track = requireTrack(message.id);
  if (!track.playing) return;
  const frames = Math.max(256, Math.min(65536, message.frames | 0));
  const sampleRate = Math.max(8000, Math.min(192000, message.sampleRate | 0));
  if (frames > track.outputFrames) {
    if (track.output) module._free(track.output);
    track.output = module._malloc(frames * 4);
    track.outputFrames = frames;
    if (!track.output) throw Error('libopenmpt output allocation failed');
  }
  const count = module._openmpt_module_read_interleaved_stereo(
    track.module, sampleRate, frames, track.output,
  );
  if (!count) {
    track.playing = false;
    postMessage({type: 'ended', id: message.id});
    return;
  }
  const pcm = module.HEAP16.slice(track.output >>> 1, (track.output >>> 1) + count * 2);
  postMessage({type: 'pcm', id: message.id, frames: count, sampleRate, pcm: pcm.buffer}, [pcm.buffer]);
}

async function dispatch(message) {
  const module = await runtime;
  switch (message.type) {
    case 'load': load(module, message); break;
    case 'play': play(module, message); break;
    case 'render': render(module, message); break;
    case 'stop': requireTrack(message.id).playing = false; break;
    case 'free': {
      const track = tracks.get(message.id);
      if (track) { destroy(module, track); tracks.delete(message.id); }
      break;
    }
    case 'free-all':
      for (const track of tracks.values()) destroy(module, track);
      tracks.clear();
      break;
    default: throw Error(`unsupported tracker worker message ${message.type}`);
  }
}

let chain = Promise.resolve();
self.onmessage = ({data}) => {
  chain = chain.then(() => dispatch(data)).catch(error => {
    postMessage({type: 'error', id: data?.id ?? 0, message: String(error.stack ?? error)});
  });
};
