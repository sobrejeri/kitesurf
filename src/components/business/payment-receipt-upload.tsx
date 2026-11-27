'use client';

import { useState } from 'react';

/** Render only for a real authorized payment; never pass a demo record. */
export function PaymentReceiptUpload({ paymentId }: { paymentId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <form className="grid gap-2" onSubmit={async (event) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const body = new FormData(form);
    body.set('paymentId', paymentId);
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/business/payment-receipt', { method: 'POST', body });
      const result = await response.json();
      setMessage(response.ok && result.ok ? 'Comprovante enviado.' : (typeof result.error === 'string' ? result.error : 'Não foi possível enviar o comprovante.'));
      if (response.ok && result.ok) form.reset();
    } catch { setMessage('Não foi possível confirmar o envio. Confira o pagamento antes de tentar novamente.'); }
    finally { setBusy(false); }
  }}>
    <label className="text-sm font-semibold">Anexar comprovante
      <input className="mt-1 block w-full text-sm" type="file" name="file" accept="application/pdf,image/jpeg,image/png" required disabled={busy} />
    </label>
    <p className="text-sm text-muted">PDF, JPG ou PNG de até 5 MB. O pagamento é feito fora do VentoKite.</p>
    <button className="justify-self-start rounded-lg bg-brand px-4 py-2 font-semibold text-on-brand disabled:opacity-50" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar comprovante'}</button>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </form>;
}
