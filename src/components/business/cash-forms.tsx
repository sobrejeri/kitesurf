'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Badge, Button, Field, Note, inputClass } from '@/components/ui';
import { CLOSING_MODES, PRINT_PURPOSES, UNITS, type ClosingMode } from '@/lib/business/demo';
import { reconcile, validateClosing, validateMovement, validateOpening } from '@/lib/business/caixa';
import { parseMoneyToCents } from '@/lib/business/services';
import { formatMoney } from '@/lib/format';

const NOTE = 'Gravação desativada na demonstração: ela será ligada quando as tabelas do Business forem aprovadas.';
const card = 'grid max-w-2xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2 sm:p-5';
const Err = ({ m }: { m?: string }) => (m ? <span role="alert" className="text-[12px] text-danger">{m}</span> : null);

export function OpenCashForm({ defaultUnit }: { defaultUnit: string }) {
  const [v, setV] = useState({ unitId: defaultUnit, opening: '', operator: '' });
  const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateOpening(v); setE(n); setDone(Object.keys(n).length === 0); }} className={card}>
      <div className="sm:col-span-2"><Field label="Unidade"><select value={v.unitId} onChange={(x) => { setDone(false); setV({ ...v, unitId: x.target.value }); }} className={inputClass} aria-invalid={Boolean(e.unitId)}>
        <option value="">Selecione</option>{UNITS.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select><Err m={e.unitId} /></Field></div>
      <Field label="Troco inicial (R$)"><input value={v.opening} onChange={(x) => { setDone(false); setV({ ...v, opening: x.target.value }); }} inputMode="decimal" placeholder="150,00" className={inputClass} aria-invalid={Boolean(e.opening)} /><Err m={e.opening} /></Field>
      <Field label="Quem abre o caixa"><input value={v.operator} onChange={(x) => { setDone(false); setV({ ...v, operator: x.target.value }); }} className={inputClass} aria-invalid={Boolean(e.operator)} autoComplete="off" /><Err m={e.operator} /></Field>
      <div className="grid gap-3 sm:col-span-2">{done ? <Note icon="check">Dados válidos. {NOTE}</Note> : null}<Button type="submit" className="justify-self-start">Validar abertura</Button></div>
    </form>
  );
}

export function MovementForm() {
  const [v, setV] = useState({ kind: 'sale', method: 'cash', amount: '', note: '' });
  const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const set = (k: string) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setDone(false); setV({ ...v, [k]: x.target.value }); };
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateMovement(v); setE(n); setDone(Object.keys(n).length === 0); }} className={card}>
      <Field label="Tipo"><select value={v.kind} onChange={set('kind')} className={inputClass}><option value="sale">Venda presencial</option><option value="supply">Suprimento</option><option value="bleed">Sangria</option><option value="expense">Despesa</option></select></Field>
      {v.kind === 'sale' ? <Field label="Forma de pagamento"><select value={v.method} onChange={set('method')} className={inputClass} aria-invalid={Boolean(e.method)}>
        <option value="cash">Dinheiro</option><option value="pix_external">Pix (recebido fora)</option><option value="card_external">Cartão (maquininha da escola)</option></select><Err m={e.method} /></Field> : <div />}
      <Field label="Valor (R$)"><input value={v.amount} onChange={set('amount')} inputMode="decimal" placeholder="50,00" className={inputClass} aria-invalid={Boolean(e.amount)} /><Err m={e.amount} /></Field>
      <Field label="Descrição"><input value={v.note} onChange={set('note')} className={inputClass} aria-invalid={Boolean(e.note)} autoComplete="off" /><Err m={e.note} /></Field>
      <div className="grid gap-3 sm:col-span-2">{v.kind === 'sale' && v.method !== 'cash' ? <Note>Pix e cartão são recebidos fora do VentoKite: aqui só ficam registrados e não entram na contagem do dinheiro.</Note> : null}
        {done ? <Note icon="check">Movimentação válida. {NOTE}</Note> : null}<Button type="submit" className="justify-self-start">Validar movimentação</Button></div>
    </form>
  );
}

export function CloseCashForm({ expectedCents }: { expectedCents: number }) {
  const [counted, setCounted] = useState(''); const [reason, setReason] = useState('');
  const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const cents = parseMoneyToCents(counted); const rec = cents === null ? null : reconcile(expectedCents, cents);
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateClosing({ counted, reason, expectedCents }); setE(n); setDone(Object.keys(n).length === 0); }} className={card}>
      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-sand px-3.5 py-3 text-[13px]"><span className="text-muted">Dinheiro esperado em caixa</span><strong className="tabular text-[17px] text-ink">{formatMoney(expectedCents)}</strong></div>
      <Field label="Dinheiro contado (R$)"><input value={counted} onChange={(x) => { setDone(false); setCounted(x.target.value); }} inputMode="decimal" className={inputClass} aria-invalid={Boolean(e.counted)} /><Err m={e.counted} /></Field>
      <div className="flex items-end" aria-live="polite">{rec ? <Badge tone={rec.status === 'ok' ? 'success' : rec.status === 'surplus' ? 'warning' : 'danger'}>{rec.status === 'ok' ? 'Sem diferença' : `${rec.status === 'surplus' ? 'Sobra' : 'Falta'} de ${formatMoney(Math.abs(rec.differenceCents))}`}</Badge> : null}</div>
      {rec && rec.status !== 'ok' ? <div className="sm:col-span-2"><Field label="Motivo da diferença"><input value={reason} onChange={(x) => { setDone(false); setReason(x.target.value); }} className={inputClass} aria-invalid={Boolean(e.reason)} autoComplete="off" /><Err m={e.reason} /></Field></div> : null}
      <div className="grid gap-3 sm:col-span-2">
        {done ? <Note icon="check">Fechamento válido. {NOTE} Ao gravar, o sistema registra o fechamento, gera o Excel e o PDF e os guarda no histórico. <Link href="/admin/business/caixa/fechamentos/cs-2" className="font-semibold underline">Ver um fechamento de exemplo</Link></Note> : null}
        <Button type="submit" className="justify-self-start">Validar fechamento</Button></div>
    </form>
  );
}

interface PrinterRow { mode: ClosingMode; printer: string; width: string; purposes: string[] }
const DEFAULT_ROW: PrinterRow = { mode: 'daily', printer: '', width: '80', purposes: ['closing', 'sale'] };

export function CashSettings() {
  const units = UNITS.filter((u) => u.active);
  const [rows, setRows] = useState<Record<string, PrinterRow>>({});
  const [done, setDone] = useState(false);
  const get = (id: string): PrinterRow => rows[id] ?? DEFAULT_ROW;
  const patch = (id: string, p: Partial<PrinterRow>) => { setDone(false); setRows({ ...rows, [id]: { ...get(id), ...p } }); };
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); setDone(true); }} className="grid gap-4">
      {units.map((u) => { const r = get(u.id); return (
        <fieldset key={u.id} className="grid gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-3 sm:p-5">
          <legend className="px-1 text-[14px] font-semibold text-ink">{u.name}</legend>
          <Field label="Fechamento"><select value={r.mode} onChange={(x) => patch(u.id, { mode: x.target.value as ClosingMode })} className={inputClass}>{CLOSING_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
            <span className="text-[12px] text-muted">{CLOSING_MODES.find((m) => m.id === r.mode)?.hint}</span></Field>
          <Field label="Impressora (nome)"><input value={r.printer} onChange={(x) => patch(u.id, { printer: x.target.value.slice(0, 40) })} placeholder="Ex.: Térmica balcão" className={inputClass} /></Field>
          <Field label="Papel"><select value={r.width} onChange={(x) => patch(u.id, { width: x.target.value })} className={inputClass}><option value="58">58 mm (32 colunas)</option><option value="80">80 mm (48 colunas)</option></select></Field>
          <div className="sm:col-span-3"><p className="mb-1.5 text-[13px] font-medium text-ink">Imprimir nesta impressora</p><div className="flex flex-wrap gap-2">{PRINT_PURPOSES.map((p) => (
            <label key={p.id} className={`press cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${r.purposes.includes(p.id) ? 'border-brand bg-brand-soft text-brand' : 'border-line-ghost text-muted'}`}>
              <input type="checkbox" className="sr-only" checked={r.purposes.includes(p.id)} onChange={() => patch(u.id, { purposes: r.purposes.includes(p.id) ? r.purposes.filter((x) => x !== p.id) : [...r.purposes, p.id] })} />{p.label}</label>))}</div></div>
        </fieldset>); })}
      {done ? <Note icon="check">Configuração válida. {NOTE}</Note> : null}
      <Button type="submit" className="justify-self-start">Validar configuração</Button>
    </form>
  );
}
