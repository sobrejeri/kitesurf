import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';

import { assessStudentKiteLevel, recordMeeting, recordMeetingWithSkills, startMeeting } from '@/app/actions/instructor';
import { ActionForm } from '@/components/action-form';
import { Icon } from '@/components/icon';
import { Badge, Card, EmptyState, Field, Note, inputClass, textareaClass } from '@/components/ui';
import { InstructorStudentPhoto } from '@/components/instructor/student-photo';
import { requireRole } from '@/lib/auth';
import { LEVEL_LABELS, MEETING_STATUS_LABELS, listBookingsForInstructor } from '@/lib/data';
import { getBookingProgress } from '@/lib/booking-progress';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import { getInstructorStudentAvatarUrls } from '@/lib/instructor-student-photos';
import { KITE_CURRICULA, KITE_LEVEL_BADGES } from '@/lib/kite-steps';
import { findCompletedInstructorMeeting, listCompletedInstructorMeetings } from '@/lib/instructor-completed-meetings';
import { getMeetingKiteSkills } from '@/lib/meeting-skills';
import { listMeetingChanges } from '@/lib/meeting-changes';
import { releaseMyBooking } from '@/app/actions/meeting-change';
import { MeetingChangePanel } from '@/components/meeting-change-panel';
import { listPendingBalanceRequestsForInstructor } from '@/lib/balance-requests';
import { InstructorBalanceRequests, type PendingBalanceItem } from '@/components/instructor/balance-requests';
import { groupInstructorLessons, resolveInstructorLessonTab, selectInstructorLesson, mayStartInstructorLesson } from '@/lib/instructor-lesson-tabs';
import { getBookingLevelAssessments } from '@/lib/booking-level-assessments';


export const metadata: Metadata = { title: 'Aulas do instrutor' };

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Fortaleza' });
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'America/Fortaleza' });
const cearaKey = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });

/** "Hoje · 4 de nov.", "Amanhã · 5 de nov.", "Quarta-feira · 12 de nov.", in Ceará time. */
function lessonDayLabel(iso: string): string {
  const key = cearaKey(Date.parse(iso));
  const now = Date.now();
  const relative = key === cearaKey(now) ? 'Hoje'
    : key === cearaKey(now + 86_400_000) ? 'Amanhã'
      : key === cearaKey(now - 86_400_000) ? 'Ontem' : null;
  const weekday = WEEKDAY.format(new Date(iso));
  return `${relative ?? weekday.charAt(0).toUpperCase() + weekday.slice(1)} · ${DAY_MONTH.format(new Date(iso))}`;
}

export default async function RunLessonPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; aula?: string }>;
}) {
  const viewer = await requireRole(['instructor'], '/instrutor/aula');
  const [bookings, studentPhotos, params] = await Promise.all([
    listBookingsForInstructor(viewer.id),
    getInstructorStudentAvatarUrls(),
    searchParams,
  ]);
  const groups = groupInstructorLessons(bookings);
  const activeTab = resolveInstructorLessonTab(params.aba, params.aula, groups);
  const selected = selectInstructorLesson(groups, activeTab, params.aula);
  const completedHistory = listCompletedInstructorMeetings(bookings);
  const selectedHistory = activeTab === 'concluidas'
    ? findCompletedInstructorMeeting(completedHistory, selected?.meeting.id)
    : null;
  const changeRequests = selected && activeTab !== 'concluidas'
    ? await listMeetingChanges(selected.booking.id)
    : { ready: true as const, rows: [] };
  const [skills, reviews] = await Promise.all([
    getMeetingKiteSkills(selectedHistory ? [selectedHistory.meeting.id] : []),
    getBookingLevelAssessments(bookings.map((booking) => booking.id)),
  ]);
  const todayInCeara = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const cearaDay = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const completed = bookings
    .filter((booking) => booking.status === 'completed' && !reviews.assessments.has(booking.id))
    .flatMap((booking) => {
      const meeting = [...booking.booking_meetings]
        .filter((m) => m.status === 'done')
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0];
      return meeting ? [{ booking, meeting }] : [];
    })
    .sort((a, b) => b.meeting.starts_at.localeCompare(a.meeting.starts_at));

  const tabs = [
    { id: 'proximas' as const, title: 'Próximas', count: groups.proximas.length },
    { id: 'andamento' as const, title: 'Em aula', count: groups.andamento.length },
    { id: 'concluidas' as const, title: 'Concluídas', count: groups.concluidas.length },
  ];

  // A day heading before the first lesson of each day, like a calendar app.
  const dayHeadings = new Map<string, string>();
  let previousDay = '';
  for (const { meeting } of groups[activeTab]) {
    const day = cearaDay(meeting.starts_at);
    if (day !== previousDay) dayHeadings.set(meeting.id, lessonDayLabel(meeting.starts_at));
    previousDay = day;
  }
  const nextLesson = groups.proximas[0];
  const summary = groups.andamento.length
    ? `${groups.andamento.length} ${groups.andamento.length === 1 ? 'aula em andamento' : 'aulas em andamento'}`
    : nextLesson
      ? `Próxima: ${(lessonDayLabel(nextLesson.meeting.starts_at).split(' · ')[0] ?? '').toLowerCase()} às ${formatTime(nextLesson.meeting.starts_at)}`
      : 'Nenhuma aula marcada';

  // Pending make-up requests the students proposed for their paid balance.
  const balancePending = await listPendingBalanceRequestsForInstructor(viewer.id);
  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]));
  const balanceItems: PendingBalanceItem[] = balancePending.rows.flatMap((row) => {
    const booking = bookingById.get(row.booking_id);
    if (!booking) return [];
    return [{
      id: row.id,
      bookingId: row.booking_id,
      code: booking.code,
      studentName: booking.student?.full_name ?? 'Aluno',
      proposedStartsAt: row.proposed_starts_at,
      minutes: row.minutes,
    }];
  });

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.5px] text-ink lg:text-[26px]">Minhas aulas</h1>
          <p className="mt-0.5 truncate text-[14px] text-muted">{summary}</p>
        </div>
        <Link href="/instrutor/agenda" aria-label="Abrir agenda completa" title="Agenda completa"
          className="press grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-brand shadow-card hover:bg-brand-wash">
          <Icon name="calendar" className="!h-5 !w-5" />
        </Link>
      </header>

      <div className="mt-4 empty:hidden">
        <InstructorBalanceRequests items={balanceItems} />
      </div>

      <nav aria-label="Filtrar aulas por status"
        className="mt-4 grid grid-cols-3 gap-1 rounded-[12px] bg-backdrop p-1 lg:max-w-[480px]">
        {tabs.map((tab) => (
          <Link key={tab.id} href={'/instrutor/aula?aba=' + tab.id}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={'press flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-[9px] px-1 text-[12.5px] font-semibold sm:text-[13px] ' +
              (activeTab === tab.id
                ? 'bg-surface text-ink shadow-card'
                : 'text-muted hover:text-ink')}>
            <span className="truncate">{tab.title}</span>
            <span className={'tabular grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold ' +
              (activeTab === tab.id ? 'bg-brand text-on-brand' : 'bg-surface/80 text-muted')}>
              {tab.count}
            </span>
          </Link>
        ))}
      </nav>

      <div id="lista-aulas" className="mt-4 scroll-mt-5 grid gap-2.5">
        {groups[activeTab].length === 0 ? (
          <EmptyState>
            {activeTab === 'proximas'
              ? 'Nenhuma aula agendada no momento. Novas reservas confirmadas aparecerão aqui.'
              : activeTab === 'andamento'
                ? 'Nenhuma aula em andamento. Ao confirmar a presença, a aula iniciada aparecerá aqui.'
                : 'Nenhuma aula concluída para consultar.'}
          </EmptyState>
        ) : (
          groups[activeTab].map(({ booking, meeting }) => {
            const expanded = selected?.meeting.id === meeting.id;
            const studentName = booking.student?.full_name?.trim() || 'Aluno';
            const progress = getBookingProgress(booking.booking_meetings);
            const statusTone = meeting.status === 'done' ? 'success'
              : meeting.status === 'in_progress' ? 'warning' : 'brand';
            const actionLabel = expanded ? 'Fechar detalhes'
              : meeting.status === 'done' ? 'Ver detalhes'
                : meeting.status === 'in_progress' ? 'Continuar aula'
                  : mayStartInstructorLesson({ booking, meeting }, todayInCeara, cearaDay)
                    ? 'Abrir e iniciar'
                    : Date.parse(meeting.starts_at) - Date.now() <= 24*3600000
                      ? 'Preparar aula' : 'Ver agendamento';
            const target = expanded
              ? '/instrutor/aula?aba=' + activeTab + '#aula-' + meeting.id
              : '/instrutor/aula?aba=' + activeTab + '&aula=' + meeting.id + '#aula-' + meeting.id;

            const primaryAction = !expanded && (meeting.status === 'in_progress' || actionLabel === 'Abrir e iniciar');
            const dayHeading = dayHeadings.get(meeting.id);

            return (
              <Fragment key={meeting.id}>
              {dayHeading ? (
                <h2 className="px-1 pt-2 text-[12px] font-semibold uppercase tracking-[.08em] text-subtle first:pt-0">{dayHeading}</h2>
              ) : null}
              <div id={`aula-${meeting.id}`}
                className={'grid gap-2 scroll-mt-28 rounded-[24px] transition-colors ' +
                  (expanded
                    ? 'bg-brand-tint p-1.5 ring-2 ring-brand/70 shadow-search'
                    : '')}>
              <Link href={target}
                aria-current={expanded ? 'page' : undefined}
                className={'press block overflow-hidden rounded-[16px] border bg-surface shadow-card transition-colors ' +
                  (expanded ? 'border-brand-focus' : 'border-line hover:border-brand-focus')}>
                <div className="flex items-stretch gap-3 p-3.5 sm:p-4">
                  <div className="flex w-[58px] shrink-0 flex-col items-center justify-center rounded-[12px] bg-brand-tint py-2 text-center">
                    <span className="tabular text-[16px] font-bold leading-none text-brand">{formatTime(meeting.starts_at)}</span>
                    <span className="mt-1 text-[11px] font-medium text-muted">{formatMinutes(meeting.minutes)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[16px] font-semibold leading-snug text-ink">{studentName}</p>
                      <Badge tone={statusTone}>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
                    </div>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] text-muted">
                      <Icon name="pin" className="!h-3.5 !w-3.5 shrink-0" />
                      <span className="truncate">{booking.beach?.name ?? 'Praia'}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] text-subtle">{booking.code}</span>
                      {booking.is_test ? <Badge tone="warning">Aula teste</Badge> : null}
                      {expanded ? (
                        <span className="rounded-full border border-brand-focus bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand">
                          Detalhes abertos
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-line bg-sand/60 px-3.5 py-2.5 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-label">
                      Encontro {meeting.position} de {booking.booking_meetings.length}
                      {progress.total > 1 ? <span className="tabular font-normal text-muted"> · {progress.completed}/{progress.total} concluídos</span> : null}
                    </p>
                    {progress.total > 1 ? (
                      <div className="mt-1.5 flex max-w-[180px] gap-1" role="progressbar" aria-label="Encontros concluídos"
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
                        aria-valuetext={`${progress.completed} de ${progress.total} encontros concluídos`}>
                        {Array.from({ length: progress.total }, (_, step) => (
                          <span key={step} className={'h-1.5 flex-1 rounded-full ' + (step < progress.completed ? 'bg-brand' : 'bg-track')} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <span className={'flex shrink-0 items-center gap-1 rounded-full text-[13px] font-semibold ' +
                    (primaryAction ? 'bg-brand px-3.5 py-2 text-on-brand shadow-button' : 'text-brand')}>
                    {actionLabel}
                    <Icon name={expanded ? 'chevronDown' : 'chevron'} className={'!h-4 !w-4 ' + (expanded ? 'rotate-180' : '')} />
                  </span>
                </div>
              </Link>
              {expanded && activeTab !== 'concluidas' ? (
                <>
      {selected ? (() => {
        const { booking, meeting } = selected;
        const canStart = mayStartInstructorLesson(selected, todayInCeara, cearaDay);
        const studentName = booking.student?.full_name?.trim() || 'Aluno';
        return (
          <Card as="section" className="!rounded-[18px] !border-brand-reserved !bg-brand-wash">
            <div id="detalhes-aula" className="scroll-mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[19px] font-bold text-ink">
                  {meeting.status === 'in_progress' ? 'Continuar aula'
                    : canStart ? 'Iniciar aula'
                      : Date.parse(meeting.starts_at)-Date.now() <= 24*3600000
                        ? 'Preparar aula' : 'Detalhes da aula'}
                </h2>
                <Badge tone={meeting.status === 'in_progress' ? 'warning' : 'brand'}>
                  {MEETING_STATUS_LABELS[meeting.status]}
                </Badge>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <InstructorStudentPhoto url={studentPhotos.get(booking.student_id) ?? null}
                  name={studentName} size={48} />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">{studentName}</p>
                  <p className="text-[12px] text-muted">
                    {booking.code} · Encontro {meeting.position} de {booking.booking_meetings.length}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[13px] text-label">
                {formatDateLong(meeting.starts_at)} · {formatTime(meeting.starts_at)}
                {' · '}{formatMinutes(meeting.minutes)}
              </p>
              <p className="mt-1 text-[12px] text-muted">
                {LEVEL_LABELS[booking.level]} · {booking.language} · {booking.beach?.name ?? 'Praia'}
              </p>
              {booking.is_test ? <div className="mt-2"><Badge tone="warning">AULA TESTE</Badge></div> : null}
              {meeting.status === 'scheduled' ? (
                <MeetingChangePanel
                  bookingId={booking.id}
                  meeting={meeting}
                  viewerId={viewer.id}
                  viewerRole="instructor"
                  bookingStatus={booking.status}
                  changes={changeRequests}
                />
              ) : null}
              {meeting.status==='scheduled' && booking.status==='confirmed'
                  && booking.booking_meetings.every(m=>m.status==='scheduled')
                  && (booking.booking_meetings.every(m=>Date.parse(m.starts_at)>=Date.now()+72*3600000)
                     || changeRequests.rows.some(r=>r.requester_id===viewer.id
                      && (r.status==='rejected'||r.status==='expired')
                      && !r.resolution && r.choice_expires_at
                      && Date.parse(r.choice_expires_at)>Date.now())) ? (
                <details className="mt-4 rounded-xl border border-orange-600/45 bg-surface p-3">
                  <summary className="cursor-pointer text-[13px] font-semibold text-brand">
                    Não posso atender · liberar para outro instrutor
                  </summary>
                  <p className="mt-2 text-[12px] text-muted">
                    A desistência exige 72 horas de antecedência ou uma solicitação
                    feita nesse prazo e recusada/sem resposta, ainda dentro da sua
                    janela de decisão. Sua atribuição será encerrada, mas o aluno manterá
                    a reserva, datas e valores.
                    A plataforma a oferecerá ao próximo instrutor disponível da fila.
                  </p>
                  <ActionForm action={releaseMyBooking} submitLabel="Liberar minha reserva"
                    className="mt-3 grid gap-3">
                    <input type="hidden" name="bookingId" value={booking.id}/>
                    <Field label="Motivo da indisponibilidade">
                      <textarea name="reason" minLength={8} maxLength={500}
                        required rows={3} className={textareaClass}/>
                    </Field>
                  </ActionForm>
                </details>
              ) : null}
              {meeting.status === 'in_progress' ? (
                <Note className="mt-4" title="Aula iniciada">
                  A presença já foi confirmada. Preencha os minutos e etapas quando terminar;
                  até registrar a conclusão, este encontro continuará na aba Em aula.
                </Note>
              ) : null}
            <div className="mt-5 border-t border-line pt-5">
              {meeting.status === 'scheduled' && !canStart ? (
                <Note tone="warning">
                  Você pode consultar os detalhes e preparar a aula com antecedência.
                  O início real exige o dia agendado, o código de presença e a conclusão
                  dos encontros anteriores. Data prevista: {formatDateLong(meeting.starts_at)}.
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
              <Link href={'/instrutor/aula?aba=' + activeTab + '#aula-' + meeting.id}
                className="press mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-ghost bg-surface px-4 text-[13px] font-semibold text-brand">
                Fechar detalhes
              </Link>
            </div>
          </Card>
        );
      })() : null}
                </>
              ) : null}
              {expanded && activeTab === 'concluidas' ? (
                <>
          {selectedHistory ? (
            <div className="rounded-[20px] border border-line bg-surface p-4">
            {selectedHistory ? (() => {
              const { booking, meeting } = selectedHistory;
              const studentName = booking.student?.full_name?.trim() || 'Aluno';
              const recorded = skills.rows.filter((skill) => skill.meeting_id === meeting.id);
              const assessment = reviews.assessments.get(booking.id);
              const evaluatedSteps = KITE_CURRICULA[booking.level].filter((step) =>
                recorded.some((skill) => skill.step_number === step.id));
              return (
                <section id="detalhes-aula"
                  className="scroll-mt-5 rounded-[18px] border border-brand-reserved bg-brand-wash p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[17px] font-bold text-ink">
                      Detalhes do encontro {meeting.position}
                    </h3>
                    <Badge tone="success">Concluído</Badge>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <InstructorStudentPhoto
                      url={studentPhotos.get(booking.student_id) ?? null}
                      name={studentName} size={48} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{studentName}</p>
                      <p className="text-[12px] text-muted">
                        {booking.code} · {booking.beach?.name ?? 'Praia'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] text-label">
                    {formatDateLong(meeting.starts_at)} às {formatTime(meeting.starts_at)}
                    {' · '}{LEVEL_LABELS[booking.level]} · {booking.language}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-[14px] border border-line bg-surface p-3">
                      <p className="text-[11px] text-muted">Tempo previsto</p>
                      <strong className="tabular mt-1 block text-[19px] text-ink">
                        {formatMinutes(meeting.minutes)}
                      </strong>
                    </div>
                    <div className="rounded-[14px] border border-line bg-surface p-3">
                      <p className="text-[11px] text-muted">Tempo realizado</p>
                      <strong className="tabular mt-1 block text-[19px] text-ink">
                        {formatMinutes(meeting.done_minutes)}
                      </strong>
                    </div>
                  </div>
                  {booking.is_test ? <div className="mt-3"><Badge tone="warning">AULA TESTE</Badge></div> : null}
                  {meeting.note?.trim() ? (
                    <div className="mt-4">
                      <h4 className="text-[13px] font-semibold text-ink">Observações registradas</h4>
                      <p className="mt-2 whitespace-pre-wrap break-words text-[13px] text-label">
                        {meeting.note}
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-4 border-t border-line pt-4">
                    <h4 className="text-[15px] font-bold text-ink">
                      Etapas trabalhadas · {evaluatedSteps.length}
                    </h4>
                    {skills.ready ? (
                      evaluatedSteps.length ? (
                        <ul className="mt-3 grid gap-2">
                          {evaluatedSteps.map((step) => {
                            const mastered = recorded.some((skill) =>
                              skill.step_number === step.id && skill.result === 'mastered');
                            return (
                              <li key={step.id} className="rounded-[12px] border border-line p-3">
                                <p className="text-[13px] font-semibold text-ink">
                                  {step.id}. {step.title}
                                </p>
                                <p className="mt-1 text-[12px] font-semibold text-brand">
                                  {mastered ? 'Concluída' : 'Praticada'}
                                </p>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="mt-2 text-[12px] text-muted">
                          Nenhuma etapa individual foi registrada neste encontro.
                        </p>
                      )
                    ) : (
                      <p className="mt-2 text-[12px] text-muted">
                        Não foi possível carregar as etapas. Os demais dados da aula permanecem disponíveis.
                      </p>
                    )}
                  </div>
                  {assessment && booking.status === 'completed' ? (
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="text-[13px] font-semibold text-ink">
                        Avaliação final da reserva:
                        {' '}{KITE_LEVEL_BADGES[assessment.assessed_level].label}
                        {' · '}{KITE_LEVEL_BADGES[assessment.assessed_level].metal}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        Avaliação feita ao concluir a reserva, não certificação oficial.
                      </p>
                    </div>
                  ) : null}
                  <Link href={'/instrutor/aula?aba=concluidas#aula-' + meeting.id}
                    className="press mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line-ghost bg-surface px-4 text-[13px] font-semibold text-brand">
                    Fechar detalhes
                  </Link>
                </section>
              );
            })() : null}
            </div>
          ) : null}
                </>
              ) : null}
              </div>
              </Fragment>
            );
          })
        )}
      </div>

      {activeTab === 'proximas' ? (
        <Note className="mt-4">
          Inicie no dia da aula com o código de presença do aluno, seguindo a ordem dos encontros.
          Depois de iniciada, ela vai para a aba Em aula.
        </Note>
      ) : null}
      {activeTab === 'andamento' ? (
        <Note className="mt-4">
          Toque na aula para registrar os minutos realizados e as etapas praticadas.
          Se ainda não terminou, ela continua aqui.
        </Note>
      ) : null}

      {activeTab === 'concluidas' ? (
        <div id="historico-aulas" className="mt-5 scroll-mt-5 grid gap-4">
          {!reviews.ready ? (
            <Note tone="warning">As avaliações finais dependem da Migration 28 no Supabase.</Note>
          ) : null}
        {reviews.ready && completed.length ? (
          <section className="mt-4 grid gap-3">
            <h2 className="text-[17px] font-semibold text-ink">Avaliações finais pendentes · {completed.length}</h2>
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

        </div>
      ) : null}
    </>
  );
}
