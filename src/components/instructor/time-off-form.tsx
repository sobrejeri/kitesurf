'use client';

import { useState } from 'react';

import { blockInstructorTime } from '@/app/actions/availability';
import { ActionForm } from '@/components/action-form';
import { Field, inputClass } from '@/components/ui';
import type { TimeOffKind } from '@/lib/instructor-agenda';

const OPTIONS: readonly { kind: TimeOffKind; label: string; hint: string }[] = [
  { kind: 'block', label: 'Bloqueio', hint: 'Algumas horas ou dias, com hora de início e fim (até 30 dias).' },
  { kind: 'day_off', label: 'Folga', hint: 'Dias inteiros (até 14 dias).' },
  { kind: 'vacation', label: 'Férias', hint: 'Dias inteiros (até 180 dias).' },
];

/** One form for block, day off and vacation: the type decides which fields are asked. The database validates again. */
export function TimeOffForm({ today }: { today: string }) {
  const [kind, setKind] = useState<TimeOffKind>('block');
  const option = OPTIONS.find((item) => item.kind === kind) ?? OPTIONS[0];
  return (
    <ActionForm action={blockInstructorTime} submitLabel={kind === 'vacation' ? 'Registrar férias' : kind === 'day_off' ? 'Registrar folga' : 'Bloquear horário'} className="mt-4 grid gap-3">
      <fieldset>
        <legend className="mb-2 text-[12px] font-medium text-label">O que você quer registrar?</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {OPTIONS.map((item) => (
            <label key={item.kind} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-[13px] font-semibold ${kind === item.kind ? 'border-brand bg-brand-soft text-brand' : 'border-line text-label'}`}>
              <input type="radio" name="kind" value={item.kind} checked={kind === item.kind} onChange={() => setKind(item.kind)} className="sr-only" />
              {item.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">{option?.hint}</p>
      </fieldset>
      {kind === 'block' ? (
        <>
          <Field label="Início"><input type="datetime-local" name="start" required className={inputClass} /></Field>
          <Field label="Término"><input type="datetime-local" name="end" required className={inputClass} /></Field>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primeiro dia"><input type="date" name="firstDay" min={today} required className={inputClass} /></Field>
          <Field label="Último dia"><input type="date" name="lastDay" min={today} required className={inputClass} /></Field>
        </div>
      )}
      <Field label="Motivo (opcional)"><input type="text" name="reason" maxLength={160} className={inputClass} placeholder="Ex.: viagem, manutenção do equipamento" /></Field>
    </ActionForm>
  );
}
