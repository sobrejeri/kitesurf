'use client';

import { useState } from 'react';

import { Button, Field, Note, inputClass } from '@/components/ui';
import { COMMISSION_ITEMS, INSTRUCTORS } from '@/lib/business/demo';
import { instructorBalance, validateExternalPayment } from '@/lib/business/finance';
import { formatMoney } from '@/lib/format';

/** Records a payment the school made on its own. Nothing is sent anywhere. */
export function ExternalPaymentForm() {
  const ids = [...new Set(COMMISSION_ITEMS.map((c) => c.instructorId))];
  const [v, setV] = useState({ instructorId: '', amount: '', method: 'pix', reference: '' });
  const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const set = (k: string) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setDone(false); setV({ ...v, [k]: x.target.value }); };
  const balance = v.instructorId ? instructorBalance(v.instructorId) : null;
  const Err = ({ m }: { m?: string }) => (m ? <span role="alert" className="text-[12px] text-danger">{m}</span> : null);
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateExternalPayment(v); setE(n); setDone(Object.keys(n).length === 0); }} className="grid max-w-2xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2 sm:p-5">
      <div className="sm:col-span-2"><Field label="Instrutor"><select value={v.instructorId} onChange={set('instructorId')} className={inputClass} aria-invalid={Boolean(e.instructorId)}>
        <option value="">Selecione</option>{ids.map((id) => <option key={id} value={id}>{INSTRUCTORS.find((i) => i.id === id)?.name}</option>)}</select><Err m={e.instructorId} /></Field>
        {balance ? <p className="mt-1.5 text-[12px] text-muted" aria-live="polite">Saldo devido: <strong className="text-ink">{formatMoney(Math.max(0, balance.balanceCents))}</strong> · já pago {formatMoney(balance.paidCents)}</p> : null}</div>
      <Field label="Valor pago (R$)"><input value={v.amount} onChange={set('amount')} inputMode="decimal" placeholder="150,00" className={inputClass} aria-invalid={Boolean(e.amount)} /><Err m={e.amount} /></Field>
      <Field label="Como foi pago"><select value={v.method} onChange={set('method')} className={inputClass}><option value="pix">Pix</option><option value="ted">Transferência (TED)</option><option value="cash">Dinheiro</option></select></Field>
      <div className="sm:col-span-2"><Field label="Referência do comprovante"><input value={v.reference} onChange={set('reference')} className={inputClass} aria-invalid={Boolean(e.reference)} autoComplete="off" placeholder="Código do Pix ou número do comprovante" /><Err m={e.reference} /></Field></div>
      <div className="grid gap-3 sm:col-span-2">
        <Note>O VentoKite não faz este pagamento: a escola paga por conta própria e aqui só registra. Pagamentos parciais são aceitos até o saldo devido, e o instrutor confirma o recebimento.</Note>
        {done ? <Note icon="check">Registro válido. Gravação desativada na demonstração: ela será ligada quando as tabelas do Business forem aprovadas.</Note> : null}
        <Button type="submit" className="justify-self-start">Validar registro</Button></div>
    </form>
  );
}
