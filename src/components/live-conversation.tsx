'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Poll only the visible conversation; keep the reader's place in older messages. */
export function LiveConversation({ children, lastMessageId, live }: {
  children: React.ReactNode; lastMessageId: string; live: boolean;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
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
    onScroll={() => { const el = box.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
    {children}
  </div>;
}
