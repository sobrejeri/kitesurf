import type { Metadata } from 'next';

import { recordMeeting, recordMeetingWithSkills, startMeeting } from '@/app/actions/instructor';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, EmptyState, Field, Note, inputClass, textareaClass } from '@/components/ui';
import { InstructorStudentPhoto } from '@/components/instructor/student-photo';
import { requireRole } from '@/lib/auth';
import { LEVEL_LABELS, MEETING_STATUS_LABELS, listBookingsForInstructor } from '@/lib/data';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import { getInstructorStudentAvatarUrls } from '@/lib/instructor-student-photos';
import { KITE_STEPS } from '@/lib/kite-steps';
import { getMeetingKiteSkills } from '@/lib/meeting-skills';

export const metadata: Metadata = { title: 'Realizar e registrar aula' };

export default async function RunLessonPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/aula');
  const [bookings, studentPhotos, skills] = await Promise.all([
    listBookingsForInstructor(viewer.id),
    getInstructorStudentAvatarUrls(),
    getMeetingKiteSkills([]),
  ]);
  const todayInCeara = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const cearaDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
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
        {open.map(({ booking, meeting }) => {
          const canStart = cearaDay(meeting.starts_at) <= todayInCeara
            && booking.booking_meetings.every((previous) => previous.position >= meeting.position || previous.status === 'done');
          const studentName = booking.student?.full_name?.trim() || 'Aluno';
          return (
          <Card key={meeting.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <InstructorStudentPhoto url={studentPhotos.get(booking.student_id) ?? null} name={studentName} size={48} />
                <div>
                  <p className="font-[550]">{studentName}</p>
                  <p className="text-[11px] text-muted">
                    {LEVEL_LABELS[booking.level]} · {booking.language} · {(booking.beach?.name ?? '—')}
                  </p>
                </div>
              </div>
              <span className="flex flex-wrap justify-end gap-1.5">
                {booking.is_test ? <Badge tone="warning">AULA TESTE</Badge> : null}
                {booking.with_transport ? <Badge tone="warning">Com transporte</Badge> : null}
                <Badge tone={meeting.status === 'in_progress' ? 'warning' : 'brand'}>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
              </span>
            </div>
            <p className="mt-4 text-[13px] font-[550]">
              {formatDateLong(meeting.starts_at)} · {formatTime(meeting.starts_at)} · {formatMinutes(meeting.minutes)}
            </p>
            <p className="text-[12px] text-muted">Reserva {booking.code} · encontro {meeting.position} de {booking.booking_meetings.length}</p>

            <div className="mt-5 border-t border-line pt-5">
              {meeting.status === 'scheduled' && !canStart ? (
                <Note tone="warning">
                  Este encontro será liberado no dia agendado, após a conclusão dos encontros anteriores.
                  A data prevista é {formatDateLong(meeting.starts_at)}.
                </Note>
              ) : meeting.status === 'scheduled' ? (
                <ActionForm action={startMeeting} submitLabel="Confirmar presença e iniciar" className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="meetingId" value={meeting.id} />
                  <div className="w-44">
                    <Field label="Código de presença">
                      <input name="presenceCode" className={`${inputClass} tabular tracking-[4px]`} inputMode="numeric" maxLength={4} pattern="[0-9]{4}" required />
                    </Field>
                  </div>
                </ActionForm>
              ) : (
                <ActionForm action={skills.ready ? recordMeetingWithSkills : recordMeeting}
                  submitLabel="Concluir e registrar encontro" className="grid gap-4">
                  <input type="hidden" name="meetingId" value={meeting.id} />
                  <div className="max-w-xs">
                    <Field label="Minutos realizados" hint={`Até ${meeting.minutes} minutos. O que não for realizado volta para o saldo do aluno.`}>
                      <input name="doneMinutes" type="number" min={0} max={meeting.minutes}
                        defaultValue={meeting.minutes} required className={inputClass} />
                    </Field>
                  </div>
                  {skills.ready ? (
                    <fieldset>
                      <legend className="text-[16px] font-bold text-ink">Etapas trabalhadas no kite</legend>
                      <p className="mt-1 text-[12px] text-muted">
                        Marque o que o aluno praticou ou já domina neste encontro.
                        As etapas aparecerão na evolução dele quando concluir a aula.
                      </p>
                      <div className="mt-3 grid gap-3">
                        {KITE_STEPS.map((step) => (
                          <div key={step.id} className="rounded-[16px] border border-line bg-surface p-3">
                            <p className="text-[14px] font-semibold text-ink">
                              <span className="mr-2 text-brand">{step.id}.</span>{step.title}
                            </p>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {([
                                ['none', 'Não feita'],
                                ['practiced', 'Praticada'],
                                ['mastered', 'Concluída'],
                              ] as const).map(([value, label]) => (
                                <label key={value}
                                  className="flex min-h-11 items-center justify-center gap-1 rounded-[11px] border border-line-input px-1.5 py-2 text-center text-[11px] font-semibold text-label has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:checked]:text-ink">
                                  <input type="radio" name={`step${step.id}`} value={value}
                                    defaultChecked={value === 'none'} className="accent-orange-500" />
                                  {label}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </fieldset>
                  ) : (
                    <Field label="O que foi trabalhado"
                      hint="A marcação por etapas estará disponível após a atualização do Supabase.">
                      <textarea name="note" maxLength={1000} className={textareaClass} />
                    </Field>
                  )}
                </ActionForm>
              )}
            </div>
          </Card>
          );
        })}
        <Note>Uma aula parcial devolve ao saldo o tempo que não foi realizado. O registro fica visível para o aluno.</Note>
      </div>
    </>
  );
}
