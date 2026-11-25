'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Intervalo de atualização da caixa de solicitações. A oferta dura 2 minutos: 10 s garante ver a oferta com tempo de sobra. */
export const OFFER_POLL_MS = 10_000;

/**
 * Mantém a caixa de solicitações do instrutor atualizada sem recarregar a página. Antes, a oferta só aparecia se o instrutor
 * recarregasse a tela dentro dos 2 minutos de validade; com um instrutor só na praia não há "próximo da fila" e a solicitação
 * simplesmente expirava sem ser vista. Só atualiza com a aba visível, não empilha chamadas e para ao sair da tela.
 */
export function InstructorOfferPoller() {
  const router = useRouter();
  const busy = useRef(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    const poll = () => {
      if (!active || busy.current || document.visibilityState !== 'visible') return;
      busy.current = true;
      try { router.refresh(); setLastCheck(new Date()); } finally { window.setTimeout(() => { busy.current = false; }, 1500); }
    };
    document.addEventListener('visibilitychange', poll);
    const interval = window.setInterval(poll, OFFER_POLL_MS);
    return () => { active = false; document.removeEventListener('visibilitychange', poll); window.clearInterval(interval); };
  }, [router]);

  return (
    <p role="status" aria-live="polite" className="text-[12px] text-muted">
      Esta tela verifica novas solicitações sozinha a cada 10 segundos. Cada oferta vale por 2 minutos: deixe-a aberta enquanto estiver disponível
      {lastCheck ? ` · última verificação ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', timeStyle: 'medium' }).format(lastCheck)}` : ''}.
    </p>
  );
}
