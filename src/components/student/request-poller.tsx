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
    const poll = () => {
      if (!active || document.visibilityState !== 'visible') return;
      startTransition(async () => {
        await refreshInstructorRequest(requestId);
        if (active) router.refresh();
      });
    };
    const interval = window.setInterval(poll, 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [requestId, router]);

  return (
    <p role="status" className="mt-3 text-[12px] text-muted">
      {pending ? 'Atualizando disponibilidade…' : 'Verificando novas respostas automaticamente.'}
    </p>
  );
}
