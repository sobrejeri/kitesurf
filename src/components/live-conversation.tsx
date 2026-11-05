'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Poll only the visible conversation; keep the reader's place in older messages. */
export function LiveConversation({ children, lastMessageId, live, receipt }: {
  children: React.ReactNode; lastMessageId: string; live: boolean;
  receipt?:{area:"aluno"|"instrutor";bookingId:string;through:string};
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const marked=useRef('');
  const busy=useRef(false);
  const area=receipt?.area, bookingId=receipt?.bookingId, through=receipt?.through;
  const markRead=useCallback(async()=>{
    if(!live || !area || !bookingId || !through || !lastMessageId || busy.current || !follow.current
      || document.visibilityState!=='visible' || !document.hasFocus())return;
    const el=box.current;
    if(!el || el.scrollHeight-el.scrollTop-el.clientHeight>=80)return;
    const bounds=el.getBoundingClientRect();
    const end=Math.min(bounds.bottom,bounds.top+el.scrollHeight-el.scrollTop);
    if(end<=0 || end>window.innerHeight+20)return;
    const key=bookingId+':'+lastMessageId;
    if(marked.current===key)return;
    busy.current=true;
    try{
      const response=await fetch(`/${area}/chat-live`,{method:'POST',signal:AbortSignal.timeout(12000),
        headers:{'Content-Type':'application/json','x-vento-chat':'1'},
        body:JSON.stringify({type:'read',bookingId,lastMessageId,through})});
      if(response.ok){const result=await response.json();if(!result.hasMore)marked.current=key;}
    }catch{/* Retry on the next refresh, keeping unread messages visible. */}
    finally{busy.current=false;}
  },[live,area,bookingId,through,lastMessageId]);
  useEffect(()=>{
    void markRead();
    const update=()=>{void markRead();};
    const timer=window.setInterval(update,3000);
    window.addEventListener('focus',update);window.addEventListener('scroll',update,{passive:true});document.addEventListener('visibilitychange',update);
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('scroll',update);document.removeEventListener('visibilitychange',update);};
  },[markRead]);
  useEffect(() => {
    if (!live) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [live, router]);
  useEffect(() => {
    if (live && follow.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lastMessageId, live]);
  return <div ref={box} className="max-h-[60dvh] overflow-y-auto overscroll-contain"
    onScroll={() => { const el = box.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; void markRead(); }}>
    {children}
  </div>;
}
