/** Browser input translated to the PC scan-code/VK protocol used by Theseus. */
export const KEY_BINDINGS=Object.freeze({
 Escape:[0x01,0x1b],
 Digit1:[0x02,0x31],Digit2:[0x03,0x32],Digit3:[0x04,0x33],Digit4:[0x05,0x34],Digit5:[0x06,0x35],Digit6:[0x07,0x36],Digit7:[0x08,0x37],Digit8:[0x09,0x38],Digit9:[0x0a,0x39],Digit0:[0x0b,0x30],
 Minus:[0x0c,0xbd],Equal:[0x0d,0xbb],Backspace:[0x0e,0x08],Tab:[0x0f,0x09],
 KeyQ:[0x10,0x51],KeyW:[0x11,0x57],KeyE:[0x12,0x45],KeyR:[0x13,0x52],KeyT:[0x14,0x54],KeyY:[0x15,0x59],KeyU:[0x16,0x55],KeyI:[0x17,0x49],KeyO:[0x18,0x4f],KeyP:[0x19,0x50],BracketLeft:[0x1a,0xdb],BracketRight:[0x1b,0xdd],
 Enter:[0x1c,0x0d],ControlLeft:[0x1d,0xa2],KeyA:[0x1e,0x41],KeyS:[0x1f,0x53],KeyD:[0x20,0x44],KeyF:[0x21,0x46],KeyG:[0x22,0x47],KeyH:[0x23,0x48],KeyJ:[0x24,0x4a],KeyK:[0x25,0x4b],KeyL:[0x26,0x4c],Semicolon:[0x27,0xba],Quote:[0x28,0xde],Backquote:[0x29,0xc0],
 ShiftLeft:[0x2a,0xa0],Backslash:[0x2b,0xdc],KeyZ:[0x2c,0x5a],KeyX:[0x2d,0x58],KeyC:[0x2e,0x43],KeyV:[0x2f,0x56],KeyB:[0x30,0x42],KeyN:[0x31,0x4e],KeyM:[0x32,0x4d],Comma:[0x33,0xbc],Period:[0x34,0xbe],Slash:[0x35,0xbf],ShiftRight:[0x36,0xa1],NumpadMultiply:[0x37,0x6a],AltLeft:[0x38,0xa4],
 Space:[0x39,0x20],CapsLock:[0x3a,0x14],
 F1:[0x3b,0x70],F2:[0x3c,0x71],F3:[0x3d,0x72],F4:[0x3e,0x73],
 F5:[0x3f,0x74],F6:[0x40,0x75],F7:[0x41,0x76],F8:[0x42,0x77],
 F9:[0x43,0x78],F10:[0x44,0x79],F11:[0x57,0x7a],F12:[0x58,0x7b],
 ArrowUp:[0x48,0x26,1],ArrowLeft:[0x4b,0x25,1],ArrowRight:[0x4d,0x27,1],ArrowDown:[0x50,0x28,1],
 NumLock:[0x45,0x90],ScrollLock:[0x46,0x91],Numpad7:[0x47,0x67],Numpad8:[0x48,0x68],Numpad9:[0x49,0x69],NumpadSubtract:[0x4a,0x6d],Numpad4:[0x4b,0x64],Numpad5:[0x4c,0x65],Numpad6:[0x4d,0x66],NumpadAdd:[0x4e,0x6b],Numpad1:[0x4f,0x61],Numpad2:[0x50,0x62],Numpad3:[0x51,0x63],Numpad0:[0x52,0x60],NumpadDecimal:[0x53,0x6e],
 NumpadEnter:[0x1c,0x0d,1],ControlRight:[0x1d,0xa3,1],NumpadDivide:[0x35,0x6f,1],AltRight:[0x38,0xa5,1],
 Home:[0x47,0x24,1],PageUp:[0x49,0x21,1],End:[0x4f,0x23,1],PageDown:[0x51,0x22,1],
 Insert:[0x52,0x2d,1],Delete:[0x53,0x2e,1],MetaLeft:[0x5b,0x5b,1],MetaRight:[0x5c,0x5c,1],ContextMenu:[0x5d,0x5d,1],
});

export function keyboardMessage(type,code,repeat=false){
 const key=KEY_BINDINGS[code];
 if(!key||!['keydown','keyup'].includes(type))return null;
 return[type==='keydown'?5:6,key[0],key[1],(key[2]??0)|(repeat?2:0)];
}

function browserButtons(buttons){return(buttons&1)|((buttons&4)>>1)|((buttons&2)<<1);}
function changedButton(button){return({0:1,1:2,2:4})[button]??0;}

export function bindBrowserInput(canvas,{isRunning,send,unlock=()=>{},onCaptureChange=()=>{},debug=()=>{}}){
 const pressed=new Map();
 const captureSupported=typeof canvas.requestPointerLock==='function';
 let virtualX=canvas.width>>1,virtualY=canvas.height>>1;
 const emit=message=>{debug(message);send(message);};
 const focused=()=>document.pointerLockElement===canvas||document.activeElement===canvas;
 const releaseKeys=()=>{for(const code of pressed.keys()){const message=keyboardMessage('keyup',code);if(message)emit(message);}pressed.clear();};
 const onKey=event=>{
  if(!isRunning()||!focused())return;
  const message=keyboardMessage(event.type,event.code,event.repeat);if(!message)return;
  event.preventDefault();
  if(event.type==='keydown'){unlock();pressed.set(event.code,true);}else pressed.delete(event.code);
  emit(message);
 };
 const absolutePosition=event=>{const rect=canvas.getBoundingClientRect();return[
  Math.floor((event.clientX-rect.left)*canvas.width/rect.width),
  Math.floor((event.clientY-rect.top)*canvas.height/rect.height),
 ];};
 const onPointer=event=>{
  if(!isRunning())return;
  if(event.type==='pointerdown'){
   unlock();canvas.focus({preventScroll:true});
   try{canvas.setPointerCapture(event.pointerId);}catch(_){}
   if(document.pointerLockElement!==canvas)void canvas.requestPointerLock?.().catch?.(()=>{});
  }
  if(document.pointerLockElement===canvas&&event.type==='pointermove'){
   const rect=canvas.getBoundingClientRect();
   virtualX=(virtualX+Math.round(event.movementX*canvas.width/rect.width))|0;
   virtualY=(virtualY+Math.round(event.movementY*canvas.height/rect.height))|0;
  }else{
   [virtualX,virtualY]=absolutePosition(event);
  }
  const buttons=browserButtons(event.buttons),changed=event.type==='pointermove'?0:changedButton(event.button);
  emit([event.type==='pointerdown'?2:event.type==='pointerup'?3:4,virtualX,virtualY,changed|(buttons<<16)]);
 };
 const onLock=()=>{const locked=document.pointerLockElement===canvas;if(!locked)releaseKeys();onCaptureChange(locked,captureSupported);};
 document.addEventListener('keydown',onKey);
 document.addEventListener('keyup',onKey);
 document.addEventListener('pointerlockchange',onLock);
 window.addEventListener('blur',releaseKeys);
 for(const type of ['pointerdown','pointerup','pointermove'])canvas.addEventListener(type,onPointer);
 const contextMenu=event=>event.preventDefault();canvas.addEventListener('contextmenu',contextMenu);
 onCaptureChange(false,captureSupported);
 return{
  warp(x,y){if(Number.isInteger(x)&&Number.isInteger(y)){virtualX=x;virtualY=y;}},
  capture(){if(!isRunning())return;unlock();canvas.focus({preventScroll:true});if(captureSupported)void canvas.requestPointerLock().catch?.(()=>{});else onCaptureChange(false,false);},
  release(){if(document.pointerLockElement===canvas)void document.exitPointerLock?.();releaseKeys();},
  destroy(){releaseKeys();document.removeEventListener('keydown',onKey);document.removeEventListener('keyup',onKey);document.removeEventListener('pointerlockchange',onLock);window.removeEventListener('blur',releaseKeys);for(const type of ['pointerdown','pointerup','pointermove'])canvas.removeEventListener(type,onPointer);canvas.removeEventListener('contextmenu',contextMenu);},
 };
}
