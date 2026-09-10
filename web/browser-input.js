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
const OPPOSITE_DIRECTION=Object.freeze({ArrowLeft:'ArrowRight',ArrowRight:'ArrowLeft',ArrowUp:'ArrowDown',ArrowDown:'ArrowUp'});

export function directionalCode(code,profile={},cursorVisible=true){
 const axes=cursorVisible?null:profile?.cursorHidden;
 if(!axes)return code;
 if(axes.horizontalSign===-1&&['ArrowLeft','ArrowRight'].includes(code))return OPPOSITE_DIRECTION[code];
 if(axes.verticalSign===-1&&['ArrowUp','ArrowDown'].includes(code))return OPPOSITE_DIRECTION[code];
 return code;
}

function axisSign(value){return value===-1?-1:1;}

export function bindBrowserInput(canvas,{isRunning,send,unlock=()=>{},onCaptureChange=()=>{},onVirtualCursor=()=>{},debug=()=>{},profile={},touchRoot=null}){
 const pressed=new Map();
 const captureSupported=typeof canvas.requestPointerLock==='function';
 const touchListeners=[],touchKeys=new Map();
 let guestCursorVisible=true,virtualX=canvas.width>>1,virtualY=canvas.height>>1,joystickPointer=null,joystickDirections=[];
 const emit=message=>{debug(message);send(message);};
 const focused=()=>document.pointerLockElement===canvas||document.activeElement===canvas;
 const cursorUpdate=()=>onVirtualCursor({x:virtualX,y:virtualY,visible:guestCursorVisible&&document.pointerLockElement===canvas});
 const mappedCode=code=>directionalCode(code,profile,guestCursorVisible);
 const releaseKeys=()=>{for(const code of pressed.values()){const message=keyboardMessage('keyup',code);if(message)emit(message);}pressed.clear();};
 const onKey=event=>{
  if(!isRunning()||!focused())return;
  const code=event.type==='keyup'?(pressed.get(event.code)??mappedCode(event.code)):mappedCode(event.code);
  const message=keyboardMessage(event.type,code,event.repeat);if(!message)return;
  event.preventDefault();
  if(event.type==='keydown'){unlock();pressed.set(event.code,code);}else pressed.delete(event.code);
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
   if(!guestCursorVisible&&document.pointerLockElement!==canvas)void canvas.requestPointerLock?.().catch?.(()=>{});
  }
  if(document.pointerLockElement===canvas&&event.type==='pointermove'){
   const rect=canvas.getBoundingClientRect();
   const axes=guestCursorVisible?null:profile?.cursorHidden;
   virtualX=(virtualX+Math.round(event.movementX*canvas.width/rect.width*axisSign(axes?.horizontalSign)))|0;
   virtualY=(virtualY+Math.round(event.movementY*canvas.height/rect.height*axisSign(axes?.verticalSign)))|0;
  }else{
   [virtualX,virtualY]=absolutePosition(event);
  }
  virtualX=Math.max(0,Math.min(canvas.width-1,virtualX));virtualY=Math.max(0,Math.min(canvas.height-1,virtualY));
  const buttons=browserButtons(event.buttons),changed=event.type==='pointermove'?0:changedButton(event.button);
  emit([event.type==='pointerdown'?2:event.type==='pointerup'?3:4,virtualX,virtualY,changed|(buttons<<16)]);
  cursorUpdate();
 };
 const onLock=()=>{const locked=document.pointerLockElement===canvas;if(!locked)releaseKeys();onCaptureChange(locked,captureSupported);cursorUpdate();};
 const releaseTouchDirections=()=>{for(const code of joystickDirections){const message=keyboardMessage('keyup',code);if(message)emit(message);}joystickDirections=[];};
 const setTouchDirections=codes=>{
  const next=[...new Set(codes.map(mappedCode))];
  for(const code of joystickDirections)if(!next.includes(code)){const message=keyboardMessage('keyup',code);if(message)emit(message);}
  for(const code of next)if(!joystickDirections.includes(code)){const message=keyboardMessage('keydown',code);if(message)emit(message);}
  joystickDirections=next;
 };
 const listen=(element,type,listener)=>{element.addEventListener(type,listener);touchListeners.push([element,type,listener]);};
 if(touchRoot){
  for(const button of touchRoot.querySelectorAll('[data-touch-key]')){
   const down=event=>{if(!isRunning())return;event.preventDefault();unlock();try{button.setPointerCapture(event.pointerId);}catch(_){}const code=button.dataset.touchKey,mapped=mappedCode(code);touchKeys.set(event.pointerId,mapped);const message=keyboardMessage('keydown',mapped);if(message)emit(message);};
   const up=event=>{const code=touchKeys.get(event.pointerId);if(!code)return;event.preventDefault();touchKeys.delete(event.pointerId);const message=keyboardMessage('keyup',code);if(message)emit(message);};
   listen(button,'pointerdown',down);for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(button,type,up);
  }
  const joystick=touchRoot.querySelector('[data-touch-joystick]'),knob=touchRoot.querySelector('[data-touch-knob]');
  if(joystick){
   const move=event=>{if(event.pointerId!==joystickPointer)return;event.preventDefault();const rect=joystick.getBoundingClientRect(),radius=Math.min(rect.width,rect.height)/2,cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;let dx=event.clientX-cx,dy=event.clientY-cy;const length=Math.hypot(dx,dy),limit=radius*.62;if(length>limit){dx*=limit/length;dy*=limit/length;}if(knob)knob.style.transform=`translate(${dx}px,${dy}px)`;const dead=radius*.18,codes=[];if(dx < -dead)codes.push('ArrowLeft');else if(dx > dead)codes.push('ArrowRight');if(dy < -dead)codes.push('ArrowUp');else if(dy > dead)codes.push('ArrowDown');setTouchDirections(codes);};
   const down=event=>{if(!isRunning()||joystickPointer!==null)return;event.preventDefault();unlock();joystickPointer=event.pointerId;try{joystick.setPointerCapture(event.pointerId);}catch(_){}move(event);};
   const up=event=>{if(event.pointerId!==joystickPointer)return;event.preventDefault();joystickPointer=null;releaseTouchDirections();if(knob)knob.style.transform='translate(0px,0px)';};
   listen(joystick,'pointerdown',down);listen(joystick,'pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(joystick,type,up);
  }
 }
 document.addEventListener('keydown',onKey);
 document.addEventListener('keyup',onKey);
 document.addEventListener('pointerlockchange',onLock);
 window.addEventListener('blur',releaseKeys);
 window.addEventListener('resize',cursorUpdate);
 for(const type of ['pointerdown','pointerup','pointermove'])canvas.addEventListener(type,onPointer);
 const contextMenu=event=>event.preventDefault();canvas.addEventListener('contextmenu',contextMenu);
 onCaptureChange(false,captureSupported);
 cursorUpdate();
 return{
  warp(x,y){if(Number.isInteger(x)&&Number.isInteger(y)){virtualX=Math.max(0,Math.min(canvas.width-1,x));virtualY=Math.max(0,Math.min(canvas.height-1,y));cursorUpdate();}},
  setCursorVisible(visible){
   if(typeof visible!=='boolean'||visible===guestCursorVisible)return;
   releaseTouchDirections();guestCursorVisible=visible;cursorUpdate();
  },
  capture(){if(!isRunning())return;unlock();canvas.focus({preventScroll:true});if(captureSupported)void canvas.requestPointerLock().catch?.(()=>{});else onCaptureChange(false,false);},
  release(){if(document.pointerLockElement===canvas)void document.exitPointerLock?.();releaseKeys();releaseTouchDirections();},
  destroy(){releaseKeys();releaseTouchDirections();for(const code of touchKeys.values()){const message=keyboardMessage('keyup',code);if(message)emit(message);}touchKeys.clear();document.removeEventListener('keydown',onKey);document.removeEventListener('keyup',onKey);document.removeEventListener('pointerlockchange',onLock);window.removeEventListener('blur',releaseKeys);window.removeEventListener('resize',cursorUpdate);for(const type of ['pointerdown','pointerup','pointermove'])canvas.removeEventListener(type,onPointer);canvas.removeEventListener('contextmenu',contextMenu);for(const [element,type,listener] of touchListeners)element.removeEventListener(type,listener);onVirtualCursor({x:virtualX,y:virtualY,visible:false});},
 };
}
