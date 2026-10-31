import type { Metadata } from 'next';

import { recordMeeting, startMeeting } from '@/app/actions/instructor';
import { ActionForm } from '@/components/action-form';
import { Avatar, Badge, Card, EmptyState, Field, Note, inputClass, textareaClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { LEVEL_LABELS, MEETING_STATUS_LABELS, listBookingsForInstructor } from '@/lib/data';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Realizar e registrar aula' };

export default async function RunLessonPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/aula');
  const bookings = await listBookingsForInstructor(viewer.id);
  const open = bookings
    .filter((booking) => booking.status === 'confirmed')
    .flatMap((booking) => booking.booking_meetings.filter((m) => m.status === 'scheduled' || m.status === 'in_progress').map((meeting) => ({ booking, meeting })))
    .sort((a, b) => a.meeting.starts_at.localeCompare(b.meeting.starts_at));

  return (
    <>
      <h1 className="text-[30px] font-bold leading-tight tracking-[-0.8px] text-ink md:text-[34px]">Registrar aula</h1>
      <p className="mt-1 text-[13px] text-muted">Peça o código de presença ao aluno para iniciar. Ao final, registre os minutos realizados.</p>

      <div className="mt-6 grid gap-5">
        {open.length === 0 ? <EmptyState>Nenhum encontro confirmado para registrar.</EmptyState> : null}
        {open.map(({ booking, meeting }) => (
          <Card key={meeting.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar initials={initials(booking.student?.full_name)} tone="a3" size={44} />
                <div>
                  <p className="font-[550]">{booking.student?.full_name ?? 'Aluno'}</p>
                  <p className="text-[11px] text-muted">
                    {LEVEL_LABELS[booking.level]} · {booking.language} · {(booking.beach?.name ?? '—')}
                  </p>
                </div>
              </div>
              <span className="flex flex-wrap justify-end gap-1.5">
                {booking.with_transport ? <Badge tone="warning">Com transporte</Badge> : null}
                <Badge tone={meeting.status === 'in_progress' ? 'warning' : 'brand'}>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
              </span>
            </div>
            <p className="mt-4 text-[13px] font-[550]">
              {formatDateLong(meeting.starts_at)} · {formatTime(meeting.starts_at)} · {formatMinutes(meeting.minutes)}
            </p>
            <p className="text-[11px] text-muted">Reserva {booking.code} · encontro {meeting.position}</p>

            <div className="mt-5 border-t border-line pt-5">
              {meeting.status === 'scheduled' ? (
                <ActionForm action={startMeeting} submitLabel="Confirmar presença e iniciar" className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="meetingId" value={meeting.id} />
                  <div className="w-44">
                    <Field label="Código de presença">
                      <input name="presenceCode" className={`${inputClass} tabular tracking-[4px]`} inputMode="numeric" maxLength={4} pattern="[0-9]{4}" required />
                    </Field>
                  </div>
                </ActionForm>
              ) : (
                <ActionForm action={recordMeeting} submitLabel="Registrar aula" className="grid gap-4">
                  <input type="hidden" name="meetingId" value={meeting.id} />
                  <div className="max-w-xs">
                    <Field label="Minutos realizados" hint={`Até ${meeting.minutes} minutos. O que não for realizado volta para o saldo do aluno.`}>
                      <input name="doneMinutes" type="number" min={0} max={meeting.minutes} defaultValue={meeting.minutes} required className={inputClass} />
                    </Field>
                  </div>
                  <Field label="O que foi trabalhado">
                    <textarea name="note" maxLength={1000} className={textareaClass} />
                  </Field>
                </ActionForm>
              )}
            </div>
          </Card>
        ))}
        <Note>Uma aula parcial devolve ao saldo o tempo que não foi realizado. O registro fica visível para o aluno.</Note>
      </div>
    </>
  );
}
