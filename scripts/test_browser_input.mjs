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
const touchElement=(dataset={})=>{
 const listeners=new Map();
 return{dataset,style:{},listeners,addEventListener:(type,listener)=>listeners.set(type,listener),removeEventListener:()=>{},setPointerCapture:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:160,height:160})};
};
const escapeButton=touchElement({touchKey:'Escape'}),enterButton=touchElement({touchKey:'Enter'}),joystick=touchElement(),knob=touchElement();
const touchRoot={
 querySelectorAll:selector=>selector==='[data-touch-key]'?[escapeButton,enterButton]:[],
 querySelector:selector=>selector==='[data-touch-joystick]'?joystick:selector==='[data-touch-knob]'?knob:null,
};
const canvas={
 width:800,height:600,
 addEventListener:(type,listener)=>canvasListeners.set(type,listener),
 removeEventListener:()=>{},
 getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),
 focus:()=>{},
 requestPointerLock:async()=>{pointerLockRequests++;},
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
let pointerLockRequests=0;
const input=bindBrowserInput(canvas,{isRunning:()=>true,send:message=>sent.push(message),profile:inverted,touchRoot,onVirtualCursor:state=>cursors.push(state)});
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
let prevented=false;
enterButton.listeners.get('pointerdown')({pointerId:1,preventDefault(){prevented=true;}});
enterButton.listeners.get('pointerup')({pointerId:1,preventDefault(){}});
assert.equal(prevented,true);
assert.deepEqual(sent.slice(-2),[[5,0x1c,0x0d,0],[6,0x1c,0x0d,0]]);
input.setCursorVisible(false);
joystick.listeners.get('pointerdown')({pointerId:2,clientX:150,clientY:80,preventDefault(){}});
assert.deepEqual(sent.at(-1),[5,0x4b,0x25,1]);
assert.match(knob.style.transform,/translate\(/);
joystick.listeners.get('pointerup')({pointerId:2,preventDefault(){}});
assert.deepEqual(sent.at(-1),[6,0x4b,0x25,1]);
assert.equal(knob.style.transform,'translate(0px,0px)');
document.pointerLockElement=null;
input.setCursorVisible(true);
canvasListeners.get('pointerdown')({type:'pointerdown',pointerId:3,clientX:80,clientY:80,buttons:1,button:0,preventDefault(){}});
assert.equal(pointerLockRequests,0);
input.setCursorVisible(false);
canvasListeners.get('pointerdown')({type:'pointerdown',pointerId:4,clientX:80,clientY:80,buttons:1,button:0,preventDefault(){}});
assert.equal(pointerLockRequests,1);
input.destroy();

console.log('Browser input preserves Windows directions and guest cursor warps');
