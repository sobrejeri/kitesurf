/** Pure helpers for dragging the chat avatars as a curved, delayed trail. */
export type BubblePoint = { x:number; y:number };

/** Initial compact half-overlap, extending inward from the selected edge. */
export function seedBubbleTrail(
  leader:BubblePoint,
  count:number,
  side:'left'|'right',
  step=29
):BubblePoint[] {
  const inward=side==='right'?-1:1;
  return Array.from({length:Math.max(0,count)+1},(_,index)=>({
    x:leader.x+inward*(Math.max(0,count)-index)*step,
    y:leader.y,
  }));
}

/** Sample a point a given arc distance behind the leader's actual movement.
 * Thus a finger drawing an S, spiral, or circle is also traced by followers,
 * rather than merely moving the whole stack as one rigid block. */
export function pointBehindBubbleTrail(path:readonly BubblePoint[],behind:number):BubblePoint {
  if(!path.length)return {x:0,y:0};
  if(behind<=0)return path[path.length-1]!;
  let remaining=behind;
  for(let index=path.length-1;index>0;index--){
    const tail=path[index]!,previous=path[index-1]!;
    const length=Math.hypot(tail.x-previous.x,tail.y-previous.y);
    if(length<.01)continue;
    if(remaining<=length){
      const fraction=remaining/length;
      return {
        x:tail.x+(previous.x-tail.x)*fraction,
        y:tail.y+(previous.y-tail.y)*fraction
      };
    }
    remaining-=length;
  }
  return path[0]!;
}

/** Avoid storing unbounded pointer trails during a long dragging session. */
export function appendBubbleTrail(path:BubblePoint[],point:BubblePoint,maxPoints=800){
  const last=path[path.length-1];
  if(!last || Math.hypot(last.x-point.x,last.y-point.y)>.3)
    path.push(point);
  if(path.length>maxPoints)path.splice(0,path.length-maxPoints);
}
