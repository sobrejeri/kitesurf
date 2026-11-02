import type { Metadata } from 'next';
import Link from 'next/link';

import { assessStudentKiteLevel, recordMeeting, recordMeetingWithSkills, startMeeting } from '@/app/actions/instructor';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, EmptyState, Field, Note, inputClass, textareaClass } from '@/components/ui';
import { InstructorStudentPhoto } from '@/components/instructor/student-photo';
import { requireRole } from '@/lib/auth';
import { LEVEL_LABELS, MEETING_STATUS_LABELS, listBookingsForInstructor } from '@/lib/data';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import { getInstructorStudentAvatarUrls } from '@/lib/instructor-student-photos';
import { KITE_CURRICULA } from '@/lib/kite-steps';
import { getMeetingKiteSkills } from '@/lib/meeting-skills';
import { getBookingLevelAssessments } from '@/lib/booking-level-assessments';

export const metadata: Metadata = { title: 'Realizar e registrar aula' };

export default async function RunLessonPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/aula');
  const [bookings, studentPhotos, skills] = await Promise.all([
    listBookingsForInstructor(viewer.id),
    getInstructorStudentAvatarUrls(),
    getMeetingKiteSkills([]),
  ]);
  const reviews = await getBookingLevelAssessments(bookings.map((b) => b.id));
  const todayInCeara = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const cearaDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const completed = bookings
    .filter((booking) => booking.status === 'completed' && !reviews.assessments.has(booking.id))
    .flatMap((booking) => {
      const meeting = [...booking.booking_meetings]
        .filter((m) => m.status === 'done')
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0];
      return meeting ? [{ booking, meeting }] : [];
    })
    .sort((a, b) => b.meeting.starts_at.localeCompare(a.meeting.starts_at));
  const open = bookings
    .filter((booking) => booking.status === 'confirmed')
    .flatMap((booking) => booking.booking_meetings
      .filter((m) => m.status === 'scheduled' || m.status === 'in_progress')
      .map((meeting) => ({ booking, meeting })))
    .sort((a, b) => a.meeting.starts_at.localeCompare(b.meeting.starts_at));
  const due = open.filter(({ meeting }) => meeting.status === 'in_progress'
    || cearaDay(meeting.starts_at) <= todayInCeara);
  const future = open.filter(({ meeting }) => meeting.status === 'scheduled'
    && cearaDay(meeting.starts_at) > todayInCeara);
  const completedHistory = bookings.flatMap((booking) =>
    booking.booking_meetings.filter((meeting) => meeting.status === 'done')
      .map((meeting) => ({ booking, meeting })))
    .sort((a, b) => b.meeting.starts_at.localeCompare(a.meeting.starts_at));

  return (
    <>
      <h1 className="text-[30px] font-bold leading-tight tracking-[-0.8px] text-ink md:text-[34px]">Registrar aula</h1>
      <p className="mt-1 text-[13px] text-muted">Encontros liberados de todas as reservas.
        Aulas de outros dias ficam na agenda; uma reserva não bloqueia a outra se os horários não coincidirem.</p>
      <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
        <Link href="/instrutor/hoje" className="font-semibold text-brand underline">Meu dia</Link>
        <Link href="/instrutor/agenda" className="font-semibold text-brand underline">Agenda completa</Link>
        <Link href="/instrutor/fila" className="font-semibold text-brand underline">Fila de solicitações</Link>
      </div>

      <div className="mt-6 grid gap-5">
        {due.length === 0 ? <EmptyState>
          Nenhum encontro liberado para registrar hoje.
          {future.length ? ' Confira abaixo suas próximas aulas.' : ' Consulte sua fila para novos atendimentos.'}
        </EmptyState> : null}
        {due.map(({ booking, meeting }) => {
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
                        {KITE_CURRICULA[booking.level].map((step) => (
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
        {future.length ? (
          <details className="rounded-[20px] border border-line bg-surface p-4" open={due.length === 0}>
            <summary className="cursor-pointer text-[16px] font-bold text-ink">
              Próximos encontros · {future.length}
            </summary>
            <p className="mt-2 text-[12px] text-muted">
              Uma aula em outro dia não impede que você atenda uma segunda reserva no intervalo.
            </p>
            <ul className="mt-3 divide-y divide-line">
              {future.map(({ booking, meeting }) => (
                <li key={meeting.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">
                      {booking.student?.full_name || 'Aluno'} · {booking.code}
                    </p>
                    <p className="text-[12px] text-muted">
                      {formatDateLong(meeting.starts_at)} · {formatTime(meeting.starts_at)}
                      {' · '}Encontro {meeting.position} de {booking.booking_meetings.length}
                    </p>
                  </div>
                  <Badge tone="brand">Agendado</Badge>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {due.length ? <Note>Ao concluir, registre minutos e etapas praticadas para atualizar a evolução do aluno.</Note> : null}
        {!reviews.ready ? <Note tone="warning">
          A avaliação final por reserva precisa da Migration 28 no Supabase.
        </Note> : null}
        {reviews.ready && completed.length ? (
          <section className="mt-4 grid gap-3">
            <h2 className="text-[20px] font-bold text-ink">Avaliações finais pendentes · {completed.length}</h2>
            <p className="text-[12px] text-muted">
              A avaliação aparece quando todos os encontros da reserva terminarem.
              Depois de confirmar, ela sai das pendências e fica no histórico.
            </p>
            {completed.map(({ booking, meeting }) => (
              <Card key={'assess-' + meeting.id}>
                <p className="text-[15px] font-bold text-ink">
                  {booking.student?.full_name ?? 'Aluno'} · Reserva {booking.code}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  {formatDateLong(meeting.starts_at)} · Aula {LEVEL_LABELS[booking.level]}
                </p>
                <ActionForm action={assessStudentKiteLevel}
                  submitLabel="Confirmar avaliação de nível" className="mt-3 grid gap-3">
                  <input name="meetingId" type="hidden" value={meeting.id}/>
                  <Field label="Nível demonstrado pelo aluno">
                    <select name="kiteLevel" className={inputClass} defaultValue={booking.level}>
                      <option value="first_time">Iniciante · Bronze</option>
                      <option value="returning">Intermediário · Prata</option>
                      <option value="improving">Avançado · Ouro</option>
                    </select>
                  </Field>
                </ActionForm>
              </Card>
            ))}
          </section>
        ) : null}
        {completedHistory.length ? (
          <details className="mt-2 rounded-[20px] border border-line bg-surface p-4">
            <summary className="cursor-pointer text-[16px] font-bold text-ink">
              Histórico de encontros realizados · {completedHistory.length}
            </summary>
            <ul className="mt-3 divide-y divide-line">
              {completedHistory.map(({ booking, meeting }) => (
                <li key={meeting.id} className="py-3">
                  <p className="text-[13px] font-semibold text-ink">
                    {booking.student?.full_name ?? 'Aluno'} · {booking.code}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    {formatDateLong(meeting.starts_at)} · {formatMinutes(meeting.done_minutes)} realizados
                    {' · '}Encontro {meeting.position} de {booking.booking_meetings.length}
                  </p>
                  <span className="mt-1 inline-block text-[11px] font-semibold text-brand">
                    {reviews.assessments.has(booking.id) ? 'Nível avaliado' : 'Registro concluído'}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </>
  );
}
