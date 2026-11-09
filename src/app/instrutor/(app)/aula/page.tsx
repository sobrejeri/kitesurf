import type { Metadata } from 'next';
import Link from 'next/link';

import { assessStudentKiteLevel, recordMeeting, recordMeetingWithSkills, startMeeting } from '@/app/actions/instructor';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, DateTile, EmptyState, Field, Note, inputClass, textareaClass } from '@/components/ui';
import { InstructorStudentPhoto } from '@/components/instructor/student-photo';
import { requireRole } from '@/lib/auth';
import { LEVEL_LABELS, MEETING_STATUS_LABELS, listBookingsForInstructor } from '@/lib/data';
import { getBookingProgress } from '@/lib/booking-progress';
import { formatDateLong, formatDay, formatMinutes, formatMonthTag, formatTime } from '@/lib/format';
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
    { id: 'andamento' as const, title: 'Em andamento', count: groups.andamento.length },
    { id: 'concluidas' as const, title: 'Concluídas', count: groups.concluidas.length },
  ];

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
      <h1 className="text-[30px] font-bold leading-tight tracking-[-0.8px] text-ink md:text-[34px]">
        Minhas aulas
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Organize seus encontros por status, escolha o aluno e toque para iniciar,
        continuar o registro ou consultar uma aula finalizada.
      </p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
        <Link href="/instrutor/hoje" className="font-semibold text-brand underline">Meu dia</Link>
        <Link href="/instrutor/agenda" className="font-semibold text-brand underline">Agenda completa</Link>
        <Link href="/instrutor/fila" className="font-semibold text-brand underline">Fila de solicitações</Link>
      </div>

      <div className="mt-6">
        <InstructorBalanceRequests items={balanceItems} />
      </div>

      <nav aria-label="Filtrar aulas por status"
        className="mt-6 grid grid-cols-3 gap-1 rounded-[18px] border border-line bg-surface p-1.5">
        {tabs.map((tab) => (
          <Link key={tab.id} href={'/instrutor/aula?aba=' + tab.id}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={'press flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[13px] px-1 py-2 text-center ' +
              (activeTab === tab.id
                ? 'bg-brand text-on-brand shadow-button'
                : 'text-label hover:bg-brand-tint')}>
            <span className="text-[12px] font-bold leading-tight sm:text-[13px]">{tab.title}</span>
            <span className="tabular text-[11px] opacity-80">{tab.count}</span>
          </Link>
        ))}
      </nav>

      <div id="lista-aulas" className="mt-5 scroll-mt-5 grid gap-3">
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

            return (
              <div key={meeting.id} id={`aula-${meeting.id}`}
                className={'grid gap-2 scroll-mt-28 rounded-[24px] transition-colors ' +
                  (expanded
                    ? 'bg-[#262130] p-1.5 ring-2 ring-[#ff8a3d]/80 shadow-[0_12px_30px_#0000006b]'
                    : '')}>
              <Link href={target}
                aria-current={expanded ? 'page' : undefined}
                className={'press block rounded-[20px] border p-4 shadow-card sm:p-5 ' +
                  (expanded
                    ? 'border-[#ff8a3d] bg-[#2d2535] shadow-[0_4px_18px_#00000055]'
                    : 'border-line bg-surface')}>
                <div className="flex items-start gap-3">
                  <DateTile day={formatDay(meeting.starts_at)}
                    month={formatMonthTag(meeting.starts_at)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={statusTone}>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
                      {booking.is_test ? <Badge tone="warning">AULA TESTE</Badge> : null}
                      {expanded ? (
                        <span className="rounded-full border border-[#ff8a3d]/65 bg-[#ff8a3d]/15 px-2 py-1 text-[10px] font-bold text-[#ffc18f]">
                          Detalhes abertos
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 break-words text-[15px] font-bold text-ink">
                      {studentName}
                    </p>
                    <p className="mt-1 text-[12px] text-muted">
                      {formatTime(meeting.starts_at)} · {formatMinutes(meeting.minutes)}
                      {' · '}{booking.beach?.name ?? 'Praia'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px] text-label">
                    {booking.code} · Encontro {meeting.position} de {booking.booking_meetings.length}
                  </p>
                  <span className="text-[12px] font-bold text-brand">{actionLabel} ›</span>
                </div>
                {progress.total > 1 ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                      <span>Progresso da reserva</span>
                      <span className="tabular">{progress.completed}/{progress.total} concluídos</span>
                    </div>
                    <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-track"
                      role="progressbar" aria-label="Encontros concluídos"
                      aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                      <span className="h-full bg-brand" style={{ width: progress.percent + '%' }} />
                    </div>
                  </div>
                ) : null}
              </Link>
              {expanded && activeTab !== 'concluidas' ? (
                <>
      {selected ? (() => {
        const { booking, meeting } = selected;
        const canStart = mayStartInstructorLesson(selected, todayInCeara, cearaDay);
        const studentName = booking.student?.full_name?.trim() || 'Aluno';
        return (
          <Card as="section" className="!rounded-[20px] !border-[#734329] !bg-[#191c2b]">
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
                  até registrar a conclusão, este encontro continuará Em andamento.
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
                className="mt-4 inline-block text-[13px] font-bold text-brand underline">
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
                  className="scroll-mt-5 rounded-[20px] border border-[#734329] bg-[#191c2b] p-4">
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
                    className="mt-5 inline-block text-[13px] font-bold text-brand underline">
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
            );
          })
        )}
      </div>

      {activeTab === 'proximas' ? (
        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          A aula só pode ser iniciada no dia permitido, com o código de presença do aluno
          e após os encontros anteriores da mesma reserva. Depois de iniciada,
          ela passa para a aba Em andamento.
        </p>
      ) : null}
      {activeTab === 'andamento' ? (
        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          Escolha a aula para registrar os minutos efetivamente realizados e as etapas praticadas.
          Se ainda não terminou, deixe-a em andamento para continuar mais tarde.
        </p>
      ) : null}

      {activeTab === 'concluidas' ? (
        <div id="historico-aulas" className="mt-5 scroll-mt-5 grid gap-4">
          {!reviews.ready ? (
            <Note tone="warning">As avaliações finais dependem da Migration 28 no Supabase.</Note>
          ) : null}
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

        </div>
      ) : null}
    </>
  );
}
