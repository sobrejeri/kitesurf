'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { refreshInstructorRequest } from '@/app/actions/offers';

/** As long as the student's search is open, progress expired offers. */
export function RequestPoller({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    let busy = false;
    const poll = () => {
      if (!active || busy || document.visibilityState !== 'visible') return;
      busy = true;
      startTransition(async () => {
        try {
          await refreshInstructorRequest(requestId);
          if (active) router.refresh();
        } finally {
          busy = false;
        }
      });
    };
    poll();
    document.addEventListener('visibilitychange', poll);
    const interval = window.setInterval(poll, 10000);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', poll);
      window.clearInterval(interval);
    };
  }, [requestId, router]);

  return (
    <p role="status" className="mt-3 text-[12px] text-muted">
      {pending ? 'Atualizando disponibilidade…' : 'Verificando novas respostas automaticamente.'}
    </p>
  );
}
