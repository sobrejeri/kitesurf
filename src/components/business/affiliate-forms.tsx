'use client';

import { useState } from 'react';

import { Button, Field, Note, inputClass } from '@/components/ui';
import { OFFERS, bpsLabel, currentRate, offerKind, offerName, parsePercentToBps, validateCampaign, validateDecision, validateRate } from '@/lib/business/affiliates';

const NOTE = 'Gravação desativada na demonstração: ela será ligada quando as tabelas do Business forem aprovadas.';
const Err = ({ m }: { m?: string }) => (m ? <span role="alert" className="text-[12px] text-danger">{m}</span> : null);

export function RateForm() {
  const [scope, setScope] = useState('default'); const [percent, setPercent] = useState(''); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const bps = parsePercentToBps(percent);
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateRate({ scope, percent }); setE(n); setDone(Object.keys(n).length === 0); }} className="grid max-w-2xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2">
      <Field label="Vale para"><select value={scope} onChange={(x) => { setDone(false); setScope(x.target.value); }} className={inputClass}><option value="default">Padrão (todos os itens sem percentual próprio)</option>{OFFERS.map((o) => <option key={o} value={o}>{offerKind(o)} · {offerName(o)}</option>)}</select><Err m={e.scope} /></Field>
      <Field label="Novo percentual (%)"><input value={percent} onChange={(x) => { setDone(false); setPercent(x.target.value); }} inputMode="decimal" placeholder="12,5" className={inputClass} autoComplete="off" /><Err m={e.percent} /></Field>
      <div className="grid gap-3 sm:col-span-2">
        <p aria-live="polite" className="text-[12.5px] text-muted">Vigente hoje: {bpsLabel(currentRate(scope))}{bps !== null ? ` · novo: ${bpsLabel(bps)}` : ''}. Vale só para vendas a partir de hoje: as vendas já feitas mantêm o percentual da época.</p>
        {done ? <Note icon="check">Percentual válido: será uma nova versão a partir de hoje. {NOTE}</Note> : null}
        <Button type="submit" className="justify-self-start">Validar percentual</Button>
      </div>
    </form>
  );
}

export function DecisionForm({ name }: { name: string }) {
  const [decision, setDecision] = useState(''); const [reason, setReason] = useState(''); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  return (
    <form noValidate aria-label={`Decisão sobre ${name}`} onSubmit={(x) => { x.preventDefault(); const n = validateDecision({ decision, reason }); setE(n); setDone(Object.keys(n).length === 0); }} className="mt-2 grid gap-3">
      <Field label="Decisão"><select value={decision} onChange={(x) => { setDone(false); setDecision(x.target.value); }} className={inputClass}><option value="">Selecione</option><option value="approve">Aprovar afiliação</option><option value="decline">Recusar</option></select><Err m={e.decision} /></Field>
      {decision === 'decline' ? <Field label="Motivo da recusa"><input value={reason} onChange={(x) => { setDone(false); setReason(x.target.value); }} className={inputClass} autoComplete="off" /><Err m={e.reason} /></Field> : null}
      {done ? <Note icon="check">{decision === 'approve' ? `${name} seria vinculado com o código de divulgação e o percentual padrão.` : `Recusa de ${name} registraria o motivo.`} {NOTE}</Note> : null}
      <Button type="submit" variant="ghost" className="justify-self-start">Validar decisão</Button>
    </form>
  );
}

export function CampaignForm() {
  const [v, setV] = useState({ name: '', description: '', days: '30' }); const [refs, setRefs] = useState<string[]>([]); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const set = (k: keyof typeof v) => (x: React.ChangeEvent<HTMLInputElement>) => { setDone(false); setV({ ...v, [k]: x.target.value }); };
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateCampaign({ ...v, refs }); setE(n); setDone(Object.keys(n).length === 0); }} className="grid max-w-2xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2">
      <Field label="Nome da campanha"><input value={v.name} onChange={set('name')} className={inputClass} autoComplete="off" /><Err m={e.name} /></Field>
      <Field label="Validade (dias)"><input value={v.days} onChange={set('days')} inputMode="numeric" className={inputClass} /><Err m={e.days} /></Field>
      <div className="sm:col-span-2"><Field label="Descrição"><input value={v.description} onChange={set('description')} className={inputClass} autoComplete="off" /><Err m={e.description} /></Field></div>
      <fieldset className="grid gap-2 sm:col-span-2"><legend className="text-[12px] font-medium text-label">Itens da campanha</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">{OFFERS.map((o) => <label key={o} className="flex min-h-9 items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={refs.includes(o)} onChange={(x) => { setDone(false); setRefs(x.target.checked ? [...refs, o] : refs.filter((r) => r !== o)); }} />{offerKind(o)} · {offerName(o)}</label>)}</div><Err m={e.refs} /></fieldset>
      <div className="grid gap-3 sm:col-span-2">{done ? <Note icon="check">Campanha válida. {NOTE}</Note> : null}<Button type="submit" className="justify-self-start">Validar campanha</Button></div>
    </form>
  );
}
