/** Validate and bound browser input while preserving relative pointer motion. */
export function enqueueInput(queue,message,limit=256){
 if(!Array.isArray(message)||message.length!==4||message.some(v=>!Number.isInteger(v))||![2,3,4,5,6,7].includes(message[0]))throw Error('invalid input message');
 const previous=queue.at(-1);
 if(message[0]===4&&previous?.[0]===4){queue[queue.length-1]=message;return true;}
 if(message[0]===7&&previous?.[0]===7){
  previous[1]=(previous[1]+message[1])|0;previous[2]=(previous[2]+message[2])|0;previous[3]=message[3];return true;
 }
 if(queue.length>=limit)return false;
 queue.push([...message]);return true;
}
