import assert from 'node:assert/strict';
import {KEY_BINDINGS,bindBrowserInput,keyboardMessage} from '../web/browser-input.js';

assert.deepEqual(KEY_BINDINGS.ArrowUp,[0x48,0x26,1]);
assert.deepEqual(KEY_BINDINGS.ArrowDown,[0x50,0x28,1]);
assert.deepEqual(KEY_BINDINGS.ArrowLeft,[0x4b,0x25,1]);
assert.deepEqual(KEY_BINDINGS.ArrowRight,[0x4d,0x27,1]);
assert.deepEqual(keyboardMessage('keydown','ArrowUp'),[5,0x48,0x26,1]);
assert.deepEqual(keyboardMessage('keyup','ArrowDown'),[6,0x50,0x28,1]);
assert.deepEqual(keyboardMessage('keydown','KeyW',true),[5,0x11,0x57,2]);
assert.equal(keyboardMessage('keydown','Unidentified'),null);

const documentListeners=new Map();
const windowListeners=new Map();
const canvasListeners=new Map();
const canvas={
 width:800,height:600,
 addEventListener:(type,listener)=>canvasListeners.set(type,listener),
 removeEventListener:()=>{},
 getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),
 focus:()=>{},
 requestPointerLock:async()=>{},
 setPointerCapture:()=>{},
};
globalThis.document={
 activeElement:canvas,pointerLockElement:canvas,
 addEventListener:(type,listener)=>documentListeners.set(type,listener),
 removeEventListener:()=>{},
};
globalThis.window={
 addEventListener:(type,listener)=>windowListeners.set(type,listener),
 removeEventListener:()=>{},
};
const sent=[];
const input=bindBrowserInput(canvas,{isRunning:()=>true,send:message=>sent.push(message)});
input.warp(400,300);
canvasListeners.get('pointermove')({type:'pointermove',movementX:7,movementY:-4,buttons:0,button:-1});
assert.deepEqual(sent.at(-1),[4,407,296,0]);
input.warp(1.5,2);
canvasListeners.get('pointermove')({type:'pointermove',movementX:1,movementY:1,buttons:0,button:-1});
assert.deepEqual(sent.at(-1),[4,408,297,0]);
input.destroy();

console.log('Browser input preserves Windows directions and guest cursor warps');
