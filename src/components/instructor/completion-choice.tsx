'use client';

import { useState } from 'react';

import { completeMeeting, interruptMeeting } from '@/app/actions/meeting-interruption';
import { ActionForm } from '@/components/action-form';
import { Field, Note, inputClass, textareaClass } from '@/components/ui';
import { REASON_MAX, REASON_MIN, remainingBounds } from '@/lib/meeting-interruption';

type Step = { id: number; title: string };

/** As seis etapas do kite (mesmas opções da tela atual): não feita, praticada ou concluída. */
function StepFields({ steps }: { steps: readonly Step[] }) {
  return (
    <fieldset>
      <legend className="text-[16px] font-bold text-ink">Etapas trabalhadas no kite</legend>
      <p className="mt-1 text-[12px] text-muted">Marque o que o aluno praticou ou já domina neste encontro.</p>
      <div className="mt-3 grid gap-3">
        {steps.map((step) => (
          <div key={step.id} className="rounded-[16px] border border-line bg-surface p-3">
            <p className="text-[14px] font-semibold text-ink"><span className="mr-2 text-brand">{step.id}.</span>{step.title}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([['none', 'Não feita'], ['practiced', 'Praticada'], ['mastered', 'Concluída']] as const).map(([value, label]) => (
                <label key={value}
                  className="flex min-h-11 items-center justify-center gap-1 rounded-[11px] border border-line-input px-1.5 py-2 text-center text-[11px] font-semibold text-label has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:checked]:text-ink">
                  <input type="radio" name={`step${step.id}`} value={value} defaultChecked={value === 'none'} className="accent-orange-500" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Fim de uma aula em andamento: o instrutor escolhe EXPLICITAMENTE entre concluir normalmente ou registrar uma interrupção.
 * Não há escolha pré-marcada. Nada aqui chama o banco: os formulários usam Server Actions.
 */
export function CompletionChoice({ meetingId, minutes, plannedMinutes, previousDone, steps }: {
  meetingId: string; minutes: number; plannedMinutes: number; previousDone: number; steps: readonly Step[];
}) {
  const [choice, setChoice] = useState<'normal' | 'interrupted' | null>(null);
  const [done, setDone] = useState(String(Math.round(minutes / 2)));
  const doneNow = /^\d{1,3}$/.test(done) ? Number(done) : 0;
  const bounds = remainingBounds(plannedMinutes, previousDone, doneNow);

  return (
    <div className="grid gap-4">
      <fieldset>
        <legend className="text-[16px] font-bold text-ink">Como terminou esta aula?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {([
            ['normal', 'Concluída normalmente', 'A aula acabou. Não gera saldo, mesmo que tenha durado menos que o previsto.'],
            ['interrupted', 'Interrompida', 'Algo impediu de terminar (vento, clima, segurança). Você agenda a continuidade do mesmo encontro.'],
          ] as const).map(([value, title, hint]) => (
            <label key={value}
              className="flex min-h-14 cursor-pointer items-start gap-3 rounded-[14px] border border-line-input p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-tint">
              <input type="radio" name="completion-choice" value={value} checked={choice === value}
                onChange={() => setChoice(value)} className="mt-1 accent-orange-500" />
              <span><span className="block text-[14px] font-semibold text-ink">{title}</span><span className="block text-[12px] text-muted">{hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      {choice === 'normal' ? (
        <ActionForm action={completeMeeting} submitLabel="Concluir aula" className="grid gap-4">
          <input type="hidden" name="meetingId" value={meetingId} />
          <div className="max-w-xs">
            <Field label="Minutos realizados" hint={`Até ${minutes} minutos.`}>
              <input name="doneMinutes" type="number" min={0} max={minutes} defaultValue={minutes} required className={inputClass} />
            </Field>
          </div>
          <StepFields steps={steps} />
        </ActionForm>
      ) : null}

      {choice === 'interrupted' ? (
        <ActionForm action={interruptMeeting} submitLabel="Registrar interrupção" className="grid gap-4">
          <input type="hidden" name="meetingId" value={meetingId} />
          <Field label="Motivo da interrupção" hint={`${REASON_MIN} a ${REASON_MAX} caracteres. O aluno vê que a aula foi interrompida.`}>
            <textarea name="reason" required minLength={REASON_MIN} maxLength={REASON_MAX} rows={3} className={textareaClass} />
          </Field>
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <Field label="Minutos ministrados agora" hint={`De 0 a ${minutes}.`}>
              <input name="doneMinutes" type="number" min={0} max={minutes} value={done} onChange={(e) => setDone(e.target.value)} required className={inputClass} />
            </Field>
            <Field label="Tempo restante a continuar"
              hint={bounds.canInterrupt ? `De 1 a ${bounds.max} min (previsto ${plannedMinutes} − já dado ${previousDone + doneNow}).` : 'Não sobrou tempo.'}>
              <input key={bounds.max} name="remainingMinutes" type="number" min={1} max={Math.max(bounds.max, 1)} defaultValue={bounds.max || ''}
                required disabled={!bounds.canInterrupt} className={inputClass} />
            </Field>
          </div>
          {!bounds.canInterrupt ? (
            <Note tone="warning">Com {previousDone + doneNow} min ministrados de {plannedMinutes} previstos não resta tempo para continuar. Reduza os minutos ministrados ou conclua a aula normalmente.</Note>
          ) : null}
          <StepFields steps={steps} />
          <Note>Depois de registrar, o aluno recebe um aviso com o link do chat da reserva. A continuidade é agendada por você, no mesmo encontro, sem nova cobrança.</Note>
        </ActionForm>
      ) : null}
    </div>
  );
}
