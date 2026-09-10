import assert from 'node:assert/strict';
import {KEY_BINDINGS,keyboardMessage} from '../web/browser-input.js';

assert.deepEqual(KEY_BINDINGS.ArrowUp,[0x48,0x26,1]);
assert.deepEqual(KEY_BINDINGS.ArrowDown,[0x50,0x28,1]);
assert.deepEqual(KEY_BINDINGS.ArrowLeft,[0x4b,0x25,1]);
assert.deepEqual(KEY_BINDINGS.ArrowRight,[0x4d,0x27,1]);
assert.deepEqual(keyboardMessage('keydown','ArrowUp'),[5,0x48,0x26,1]);
assert.deepEqual(keyboardMessage('keyup','ArrowDown'),[6,0x50,0x28,1]);
assert.deepEqual(keyboardMessage('keydown','KeyW',true),[5,0x11,0x57,2]);
assert.equal(keyboardMessage('keydown','Unidentified'),null);
console.log('Browser key mapping preserves Windows VK and DirectInput directions');
