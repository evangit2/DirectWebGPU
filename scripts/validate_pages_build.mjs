// Validate the static demo build in web/ before Pages deployment.
import { readFileSync, existsSync } from 'node:fs';

const b = JSON.parse(readFileSync('web/build-manifest.json', 'utf8'));
if (!Array.isArray(b.files) || !b.files.length) throw new Error('no files');
if (!b.dependencies?.executable) throw new Error('no executable entry');
if (!b.runtimeBuild?.artifacts?.['humus_bg.wasm']) throw new Error('no wasm artifact entry');
if (!b.wasm_available) throw new Error('wasm_available false');

for (const f of b.files) {
  if (!f.path || !f.sha256) throw new Error('bad manifest entry');
  if (f.path.includes('..')) throw new Error('path traversal: ' + f.path);
  if (!existsSync('web/assets/' + f.path)) throw new Error('missing file: ' + f.path);
}
if (!existsSync('web/generated/humus_bg.wasm')) throw new Error('missing humus_bg.wasm');
if (!existsSync('web/generated/humus.js')) throw new Error('missing humus.js');
if (!existsSync('web/generated/mojoshader.wasm')) throw new Error('missing mojoshader.wasm');
if (!existsSync('web/generated/vkd3d_shader.js')) throw new Error('missing vkd3d_shader.js');
if (!existsSync('web/generated/vkd3d_shader.wasm')) throw new Error('missing vkd3d_shader.wasm');
if (!existsSync('web/generated/vkd3d-LICENSE')) throw new Error('missing vkd3d license');
if (!existsSync('web/coi-serviceworker.js')) throw new Error('missing coi-serviceworker.js');

console.log('manifest OK:', b.files.length, 'files; wasm artifact',
  b.runtimeBuild.artifacts['humus_bg.wasm'].bytes, 'bytes');
