'use client';

import { useMemo, useState } from 'react';

import { Button, Field, Note, inputClass } from '@/components/ui';
import { INSTRUCTORS, LESSON_REQUESTS, UNITS } from '@/lib/business/demo';
import { currentContext } from '@/lib/business/bookings';
import { instructorRateAt, parsePercentToBps, validateAssignment, validateAvailability, validateInstructorInvite, validateInstructorRate, validateResponse, WEEKDAY_NAME } from '@/lib/business/instructors';
import { formatBps } from '@/lib/format';

import { Form, adapt, type Option } from './stock-forms';

const NOTE = 'Gravação desativada na demonstração: ela será ligada quando as tabelas do Business forem aprovadas.';
const Err = ({ m }: { m?: string }) => (m ? <span role="alert" className="text-[12px] text-danger">{m}</span> : null);
const units: Option[] = UNITS.filter((u) => u.active).map((u) => [u.id, u.name]);

export function InviteInstructorForm() {
  const [v, setV] = useState({ name: '', email: '', percent: '55' }); const [ids, setIds] = useState<string[]>([]); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const set = (k: keyof typeof v) => (x: React.ChangeEvent<HTMLInputElement>) => { setDone(false); setV({ ...v, [k]: x.target.value }); };
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateInstructorInvite({ ...v, unitIds: ids }); setE(n); setDone(Object.keys(n).length === 0); }} className="grid max-w-2xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2">
      <Field label="Nome do instrutor"><input value={v.name} onChange={set('name')} className={inputClass} autoComplete="off" /><Err m={e.name} /></Field>
      <Field label="E-mail"><input value={v.email} onChange={set('email')} inputMode="email" className={inputClass} autoComplete="off" /><Err m={e.email} /></Field>
      <fieldset className="grid gap-1.5 sm:col-span-2"><legend className="text-[12px] font-medium text-label">Unidades em que vai atuar</legend>
        <div className="grid gap-1 sm:grid-cols-2">{units.map(([id, label]) => <label key={id} className="flex min-h-9 items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={ids.includes(id)} onChange={(x) => { setDone(false); setIds(x.target.checked ? [...ids, id] : ids.filter((q) => q !== id)); }} />{label}</label>)}</div><Err m={e.unitIds} /></fieldset>
      <Field label="Comissão proposta (%)"><input value={v.percent} onChange={set('percent')} inputMode="decimal" className={inputClass} /><Err m={e.percent} /></Field>
      <div className="grid gap-3 sm:col-span-2">
        <p className="text-[12.5px] text-muted">O instrutor responde pelo próprio app. Até aceitar, a escola não vê a agenda nem os dados dele. Atuar aqui não tira o instrutor da fila única do VentoKite.</p>
        {done ? <Note icon="check">Convite válido: {v.name.trim()} receberia o e-mail com a proposta de {formatBps(parsePercentToBps(v.percent) ?? 0)}. {NOTE}</Note> : null}<Button type="submit" className="justify-self-start">Validar convite</Button>
      </div>
    </form>
  );
}

export function ResponseForm({ name }: { name: string }) {
  const [decision, setDecision] = useState(''); const [reason, setReason] = useState(''); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  return (
    <form noValidate aria-label={`Resposta a ${name}`} onSubmit={(x) => { x.preventDefault(); const n = validateResponse({ decision, reason }); setE(n); setDone(Object.keys(n).length === 0); }} className="mt-2 grid gap-3">
      <Field label="Sua resposta"><select value={decision} onChange={(x) => { setDone(false); setDecision(x.target.value); }} className={inputClass}><option value="">Selecione</option><option value="accept">Aceitar o vínculo</option><option value="decline">Recusar</option></select><Err m={e.decision} /></Field>
      {decision === 'decline' ? <Field label="Motivo (opcional)"><input value={reason} onChange={(x) => { setDone(false); setReason(x.target.value); }} className={inputClass} autoComplete="off" /><Err m={e.reason} /></Field> : null}
      {done ? <Note icon="check">{decision === 'accept' ? 'Vínculo aceito: a escola passaria a ver só a sua disponibilidade, sem os dados de outras escolas.' : 'Convite recusado: nada muda no seu acesso ao VentoKite.'} {NOTE}</Note> : null}
      <Button type="submit" variant="ghost" className="justify-self-start">Validar resposta</Button>
    </form>
  );
}

export function InstructorRateForm({ instructorId }: { instructorId: string }) {
  const link = INSTRUCTORS.find((i) => i.id === instructorId); const [scope, setScope] = useState('all'); const [percent, setPercent] = useState(''); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const bps = parsePercentToBps(percent);
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateInstructorRate({ instructorId, scope, percent }); setE(n); setDone(Object.keys(n).length === 0); }} className="grid max-w-2xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2">
      <Field label="Vale para"><select value={scope} onChange={(x) => { setDone(false); setScope(x.target.value); }} className={inputClass}><option value="all">Todas as unidades dele</option>{link?.unitIds.map((u) => <option key={u} value={u}>{UNITS.find((x) => x.id === u)?.name}</option>)}</select><Err m={e.scope} /></Field>
      <Field label="Nova comissão (%)"><input value={percent} onChange={(x) => { setDone(false); setPercent(x.target.value); }} inputMode="decimal" placeholder="62,5" className={inputClass} autoComplete="off" /><Err m={e.percent} /></Field>
      <div className="grid gap-3 sm:col-span-2">
        <p aria-live="polite" className="text-[12.5px] text-muted">Vigente hoje: {formatBps(instructorRateAt(instructorId, scope === 'all' ? '' : scope, 0))}{bps !== null ? ` · nova: ${formatBps(bps)}` : ''}. Vale só para aulas a partir de hoje: as aulas já dadas mantêm a comissão da época.</p>
        {done ? <Note icon="check">Comissão válida: será uma nova versão a partir de hoje. {NOTE}</Note> : null}<Button type="submit" className="justify-self-start">Validar comissão</Button>
      </div>
    </form>
  );
}

export const AvailabilityForm = ({ instructorId }: { instructorId: string }) => <Form submitLabel="Validar janela" init={{ weekday: '', from: '08:00', to: '16:00' }} validate={adapt(validateAvailability, ['weekday', 'from', 'to'])}
  fields={[{ k: 'weekday', label: 'Dia da semana', kind: 'select', options: WEEKDAY_NAME.map((n, i): Option => [String(i), n]) }, { k: 'from', label: 'Início', kind: 'text', ph: '08:00' }, { k: 'to', label: 'Fim', kind: 'text', ph: '16:00' }]}
  extra={() => `Janela válida para ${INSTRUCTORS.find((i) => i.id === instructorId)?.name}. Vale para todas as escolas e unidades: uma agenda só.`} />;

export function AssignForm({ requestId }: { requestId: string }) {
  const ctx = useMemo(() => currentContext(), []); const [id, setId] = useState(''); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const req = LESSON_REQUESTS.find((r) => r.id === requestId);
  return (
    <form noValidate aria-label={`Atribuir pedido ${requestId}`} onSubmit={(x) => { x.preventDefault(); const n = validateAssignment({ requestId, instructorId: id }, ctx); setE(n); setDone(Object.keys(n).length === 0); }} className="mt-2 grid gap-3">
      <Field label="Instrutor"><select value={id} onChange={(x) => { setDone(false); setId(x.target.value); }} className={inputClass}><option value="">Selecione</option>{INSTRUCTORS.filter((i) => i.unitIds.includes(req?.unitId ?? '')).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select><Err m={e.instructorId ?? e.requestId} /></Field>
      {done ? <Note icon="check">Atribuição válida: o horário seria reservado na agenda única do instrutor. {NOTE}</Note> : null}
      <Button type="submit" variant="ghost" className="justify-self-start">Validar atribuição</Button>
    </form>
  );
}
