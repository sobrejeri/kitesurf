'use client';

import { useState } from 'react';

import { formatMoney } from '@/lib/format';
import { applySandboxPaymentEvent, newSandboxPayment } from '@/lib/sandbox-payment-events.mjs';
import { Card, inputClass } from '@/components/ui';

type Method = 'pix' | 'card' | 'boleto';
type Outcome = 'approved' | 'declined' | 'expired' | 'refunded';

const METHODS = {
  pix: { label: 'Pix', instructions: 'Uma cobrança Pix aguardaria a confirmação do banco.' },
  card: { label: 'Cartão de crédito', instructions: 'O cartão aguardaria a resposta do emissor. Use os botões abaixo para simular a resposta.' },
  boleto: { label: 'Boleto', instructions: 'O boleto aguardaria a compensação bancária até o vencimento.' },
};

const STATUS: Record<string, string> = {
  pending: 'Aguardando pagamento',
  approved: 'Pagamento aprovado',
  declined: 'Pagamento recusado',
  expired: 'Pagamento vencido',
  refunded: 'Pagamento reembolsado',
};

const buttonClass = 'min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-ink hover:bg-surface';

export function SandboxCheckout({ bookingId, amountCents }: { bookingId: string; amountCents: number }) {
  const [method, setMethod] = useState<Method>('pix');
  const [payment, setPayment] = useState<ReturnType<typeof applySandboxPaymentEvent> | null>(null);

  function apply(outcome: Outcome) {
    setPayment((current) => current && applySandboxPaymentEvent(current, {
      paymentId: current.paymentId,
      eventId: outcome,
      status: outcome,
    }));
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Simulação de pagamento</h2>
        <p className="mt-1 text-sm text-muted">Teste sem cobrança. O resultado não altera a reserva.</p>
      </div>
      <p className="text-sm text-ink">Total da reserva <strong>{formatMoney(amountCents)}</strong></p>
      <label className="grid gap-2 text-sm font-semibold text-ink">
        Forma de pagamento
        <select className={inputClass} value={method} onChange={(event) => {
          const value = event.target.value;
          if (value !== 'pix' && value !== 'card' && value !== 'boleto') return;
          setMethod(value);
          setPayment(null);
        }}>
          <option value="pix">Pix</option>
          <option value="card">Cartão de crédito</option>
          <option value="boleto">Boleto</option>
        </select>
      </label>
      <p className="text-sm text-muted">{METHODS[method].instructions}</p>
      <p role="status" className="text-sm font-semibold text-ink">
        {payment ? STATUS[payment.status] : 'Simulação ainda não iniciada'}
      </p>
      <div className="flex flex-wrap gap-2">
        {payment?.status === 'pending' ? (
          <>
            <button type="button" className={buttonClass} onClick={() => apply('approved')}>Simular aprovação</button>
            {method === 'card' ? (
              <button type="button" className={buttonClass} onClick={() => apply('declined')}>Simular recusa</button>
            ) : (
              <button type="button" className={buttonClass} onClick={() => apply('expired')}>Simular vencimento</button>
            )}
          </>
        ) : null}
        {payment?.status === 'approved' ? (
          <button type="button" className={buttonClass} onClick={() => apply('refunded')}>Simular reembolso</button>
        ) : null}
        <button type="button" className={buttonClass} onClick={() => setPayment(newSandboxPayment({
          paymentId: `booking:${bookingId}`,
          method,
        }))}>
          {payment ? 'Reiniciar simulação' : `Simular pagamento por ${METHODS[method].label}`}
        </button>
      </div>
    </Card>
  );
}
