/** Keep streamed game audio responsive when a slower page falls behind. */
export function audioQueueLimit(coarsePointer=false){return coarsePointer?0.3:0.6;}

export function audioQueueNeedsReset(nextTime,currentTime,coarsePointer=false){
 return Number.isFinite(nextTime)&&Number.isFinite(currentTime)&&nextTime-currentTime>audioQueueLimit(coarsePointer);
}
