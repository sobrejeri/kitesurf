'use client';

import { scheduleMeetingResume } from '@/app/actions/meeting-interruption';
import { ActionForm } from '@/components/action-form';
import { Field, inputClass } from '@/components/ui';

/** Agendar (ou reagendar) a continuidade do mesmo encontro. Horário de Fortaleza; min e max vêm do servidor. */
export function ResumeScheduler({ meetingId, min, max, defaultValue, rescheduling }: {
  meetingId: string; min: string; max: string; defaultValue?: string; rescheduling: boolean;
}) {
  return (
    <ActionForm action={scheduleMeetingResume} submitLabel={rescheduling ? 'Reagendar continuidade' : 'Agendar continuidade'} className="grid gap-3">
      <input type="hidden" name="meetingId" value={meetingId} />
      <div className="max-w-xs">
        <Field label="Data e hora da continuidade" hint="Horário de Fortaleza, em até 90 dias. A agenda e os conflitos são conferidos ao salvar.">
          <input name="startsAt" type="datetime-local" required min={min} max={max} defaultValue={defaultValue} className={inputClass} />
        </Field>
      </div>
    </ActionForm>
  );
}
