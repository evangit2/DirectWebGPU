import assert from 'node:assert/strict';
import {KEY_BINDINGS,bindBrowserInput,directionalCode,keyboardMessage} from '../web/browser-input.js';

assert.deepEqual(KEY_BINDINGS.ArrowUp,[0x48,0x26,1]);
assert.deepEqual(KEY_BINDINGS.ArrowDown,[0x50,0x28,1]);
assert.deepEqual(KEY_BINDINGS.ArrowLeft,[0x4b,0x25,1]);
assert.deepEqual(KEY_BINDINGS.ArrowRight,[0x4d,0x27,1]);
assert.deepEqual(keyboardMessage('keydown','ArrowUp'),[5,0x48,0x26,1]);
assert.deepEqual(keyboardMessage('keyup','ArrowDown'),[6,0x50,0x28,1]);
assert.deepEqual(keyboardMessage('keydown','KeyW',true),[5,0x11,0x57,2]);
assert.equal(keyboardMessage('keydown','Unidentified'),null);
const inverted={cursorHidden:{horizontalSign:-1,verticalSign:-1}};
assert.equal(directionalCode('ArrowUp',inverted,false),'ArrowDown');
assert.equal(directionalCode('ArrowLeft',inverted,false),'ArrowRight');
assert.equal(directionalCode('ArrowUp',inverted,true),'ArrowUp');
assert.equal(directionalCode('Enter',inverted,false),'Enter');

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
const cursors=[];
const input=bindBrowserInput(canvas,{isRunning:()=>true,send:message=>sent.push(message),profile:inverted,onVirtualCursor:state=>cursors.push(state)});
input.warp(400,300);
canvasListeners.get('pointermove')({type:'pointermove',movementX:7,movementY:-4,buttons:0,button:-1});
assert.deepEqual(sent.at(-1),[4,407,296,0]);
input.warp(1.5,2);
canvasListeners.get('pointermove')({type:'pointermove',movementX:1,movementY:1,buttons:0,button:-1});
assert.deepEqual(sent.at(-1),[4,408,297,0]);
input.setCursorVisible(false);
canvasListeners.get('pointermove')({type:'pointermove',movementX:2,movementY:3,buttons:0,button:-1});
assert.deepEqual(sent.at(-1),[4,406,294,0]);
documentListeners.get('keydown')({type:'keydown',code:'ArrowUp',repeat:false,preventDefault(){}});
documentListeners.get('keyup')({type:'keyup',code:'ArrowUp',repeat:false,preventDefault(){}});
assert.deepEqual(sent.slice(-2),[[5,0x50,0x28,1],[6,0x50,0x28,1]]);
assert.equal(cursors.at(-1).visible,false);
input.setCursorVisible(true);
assert.equal(cursors.at(-1).visible,true);
input.destroy();

console.log('Browser input preserves Windows directions and guest cursor warps');
