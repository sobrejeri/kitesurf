'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cancelPublicOrder } from '@/app/actions/public-store';

export function CancelForm({ number, token }: { number: string; token: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <p style={{ marginTop: 16 }}><button type="button" className="btn danger" onClick={() => setOpen(true)}>Cancelar pedido</button></p>;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <label htmlFor="why">Por que está cancelando?</label>
      <input id="why" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={150} />
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Voltar</button>
        <button type="button" className="btn danger" disabled={pending} onClick={() => start(async () => {
          const r = await cancelPublicOrder({ number, token, reason });
          if (!r.ok) setError(r.error); else router.refresh();
        })}>{pending ? 'Cancelando…' : 'Confirmar cancelamento'}</button>
      </div>
    </div>
  );
}
