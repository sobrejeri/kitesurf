import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { StudentHero } from '@/components/student/sunset';
import { KiteLevelMedal } from '@/components/student/kite-level-medal';
import { requireRole } from '@/lib/auth';
import { listBookingsForStudent } from '@/lib/data';
import {
  bookingIsFinished,
  evolutionBookingStatus,
  selectedStudentBooking,
} from '@/lib/booking-cycle';
import { getStudentKiteLevel } from '@/lib/student-kite-level';
import { getBookingLevelAssessments } from '@/lib/booking-level-assessments';
import { getMeetingKiteSkills } from '@/lib/meeting-skills';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import { KITE_CURRICULA, KITE_LEVEL_BADGES, kiteStageStatus } from '@/lib/kite-steps';
import { VALIDATION_WITHOUT_CHECKOUT } from '@/lib/booking-mode';

export const metadata: Metadata = { title: 'Minha evolução' };

function ProgressStatus({ label }: { label: string }) {
  const colors = label === 'Concluída'
    ? 'bg-[#124c3b] text-[#8bf3cb]'
    : label === 'Em aula'
      ? 'bg-[#58391d] text-[#ffc989]'
      : label === 'Em andamento'
        ? 'bg-[#113e52] text-[#81e4f3]'
        : label === 'Cancelada'
          ? 'bg-[#472735] text-[#ffb0be]'
          : 'bg-[#27374c] text-[#cbd8ed]';
  return (
    <span className={'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ' + colors}>
      {VALIDATION_WITHOUT_CHECKOUT && label === 'Aguardando pagamento' ? 'Aguardando confirmação' : label}
    </span>
  );
}

function ReservationMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[15px] border border-line bg-surface p-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="tabular mt-1 text-[21px] font-bold text-ink">{value}</p>
    </div>
  );
}

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ reserva?: string; encontro?: string }>;
}) {
  const viewer = await requireRole(['student'], '/aluno/evolucao');
  const [bookings, kiteLevel, params] = await Promise.all([
    listBookingsForStudent(viewer.id),
    getStudentKiteLevel(viewer.id),
    searchParams,
  ]);

  // Never select a reservation automatically; the id must belong to the
  // RLS-scoped list. Opening a lesson from the history expands it below.
  const selected = selectedStudentBooking(bookings, params.reserva);
  const finished = selected ? bookingIsFinished(selected) : false;

  // ---- Aggregate journey across confirmed and completed bookings ----
  const liveBookings = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed');
  const doneEncounters = liveBookings
    .flatMap((b) => b.booking_meetings
      .filter((m) => m.status === 'done')
      .map((m) => ({ booking: b, meeting: m })))
    .sort((a, b) => b.meeting.starts_at.localeCompare(a.meeting.starts_at));
  const totalContracted = liveBookings.reduce((sum, b) => sum + b.total_hours * 60, 0);
  const totalDone = liveBookings.reduce((sum, b) =>
    sum + b.booking_meetings.reduce((t, m) => t + (m.status === 'done' ? m.done_minutes : 0), 0), 0);
  const journeyPercent = totalContracted ? Math.min(100, Math.round((totalDone / totalContracted) * 100)) : 0;
  const curriculumLevel = kiteLevel.effective;
  const curriculum = KITE_CURRICULA[curriculumLevel];
  // Aggregate skills only from meetings taught at the student's current level,
  // so step numbers map to the same curriculum.
  const levelDoneMeetingIds = new Set(
    liveBookings.filter((b) => b.level === curriculumLevel)
      .flatMap((b) => b.booking_meetings.filter((m) => m.status === 'done').map((m) => m.id)),
  );

  // Detailed queries: journey skills (all done meetings) plus the opened booking.
  const [journeySkillsRes, skills, reviews] = await Promise.all([
    getMeetingKiteSkills(doneEncounters.map((e) => e.meeting.id)),
    selected
      ? getMeetingKiteSkills(selected.booking_meetings.map((meeting) => meeting.id))
      : Promise.resolve({ ready: true, rows: [] }),
    getBookingLevelAssessments(selected && finished ? [selected.id] : []),
  ]);
  const curriculumSkills = journeySkillsRes.rows.filter((s) => levelDoneMeetingIds.has(s.meeting_id));
  const skillsByMeeting = new Map<string, number>();
  for (const row of journeySkillsRes.rows) {
    skillsByMeeting.set(row.meeting_id, (skillsByMeeting.get(row.meeting_id) ?? 0) + 1);
  }

  const assessment = selected ? reviews.assessments.get(selected.id) : undefined;
  const registeredSkills = skills.rows;
  const doneIds = new Set(
    selected?.booking_meetings
      .filter((meeting) => meeting.status === 'done')
      .map((meeting) => meeting.id) ?? [],
  );
  const pathSkills = registeredSkills.filter((skill) => doneIds.has(skill.meeting_id));
  const sortedMeetings = selected
    ? [...selected.booking_meetings].sort((a, b) =>
        a.starts_at.localeCompare(b.starts_at) || a.position - b.position)
    : [];
  const contracted = selected ? selected.total_hours * 60 : 0;
  const doneMinutes = selected
    ? selected.booking_meetings.reduce((sum, meeting) =>
        sum + (meeting.status === 'done' ? meeting.done_minutes : 0), 0)
    : 0;
  const scheduledMinutes = selected
    ? selected.booking_meetings.reduce((sum, meeting) =>
        sum + (meeting.status === 'scheduled' || meeting.status === 'in_progress'
          ? meeting.minutes : 0), 0)
    : 0;
  const balance = Math.max(0, contracted - doneMinutes - scheduledMinutes);
  const percentHours = contracted
    ? Math.min(100, Math.round((doneMinutes / contracted) * 100)) : 0;
  const todayCeara = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Fortaleza',
  });

  const levelLabel = kiteLevel.assessed
    ? KITE_LEVEL_BADGES[kiteLevel.assessed].label
    : `${KITE_LEVEL_BADGES[kiteLevel.effective].label} (informado)`;

  return (
    <>
      <StudentHero image="coast" eyebrow="Sua evolução no mar"
        title="Minha evolução" highlight="evolução"
        lead="Acompanhe suas horas, habilidades e aulas concluídas no kite."
        compact plainOnMobile />

      {bookings.length === 0 ? (
        <section className="-mt-6 rounded-[22px] border border-line bg-surface p-5 md:-mt-2">
          <p className="text-[13px] text-muted">Você ainda não possui reservas.</p>
          <Link href="/aluno/reservar"
            className="mt-3 inline-block text-[13px] font-bold text-brand underline">
            Agendar minha primeira aula
          </Link>
        </section>
      ) : (
        <>
          {/* Resumo da jornada — anel e números grandes, sem cartão (direto no fundo) */}
          <section className="-mt-6 px-1 md:-mt-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[18px] font-bold text-ink">Sua jornada no kite</h2>
              <KiteLevelMedal level={kiteLevel.assessed ?? kiteLevel.effective}
                assessed={Boolean(kiteLevel.assessed)} compact />
            </div>
            <div className="mt-4 flex items-center gap-5">
              <div className="relative h-[132px] w-[132px] shrink-0"
                role="progressbar" aria-label="Horas realizadas no total"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={journeyPercent}>
                <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="66" cy="66" r="56" fill="none" stroke="var(--color-track)" strokeWidth="12" />
                  <circle cx="66" cy="66" r="56" fill="none" stroke="var(--color-brand)" strokeWidth="12"
                    strokeLinecap="round" strokeDasharray={2 * Math.PI * 56}
                    strokeDashoffset={2 * Math.PI * 56 * (1 - journeyPercent / 100)} />
                </svg>
                <div className="absolute inset-0 grid place-content-center text-center">
                  <span className="tabular text-[30px] font-extrabold leading-none text-ink">{journeyPercent}%</span>
                  <span className="mt-1 text-[11px] text-muted">do caminho</span>
                </div>
              </div>
              <div className="grid min-w-0 flex-1 gap-4">
                <div>
                  <p className="tabular text-[24px] font-extrabold leading-none text-ink">
                    {formatMinutes(totalDone)}
                    <span className="text-[14px] font-medium text-muted"> / {formatMinutes(totalContracted)}</span>
                  </p>
                  <p className="mt-1 text-[12px] text-muted">Horas realizadas</p>
                </div>
                <div>
                  <p className="text-[24px] font-extrabold leading-none text-ink">
                    <span className="tabular">{doneEncounters.length}</span> Aulas
                  </p>
                  <p className="mt-1 text-[12px] text-muted">concluídas</p>
                </div>
              </div>
            </div>
            <p className="mt-4 text-[12px] text-muted">{levelLabel}. Soma de todas as suas reservas confirmadas.</p>
          </section>

          {/* Minha jornada no kite — currículo agregado */}
          <section className="mt-5 rounded-[22px] border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <Icon name="flag" className="!h-6 !w-6 shrink-0 text-brand" />
              <div>
                <h2 className="text-[18px] font-bold text-ink">Minha jornada no kite</h2>
                <p className="mt-1 text-[12px] text-muted">
                  {KITE_LEVEL_BADGES[curriculumLevel].detail}. Reúne as habilidades registradas pelo seu instrutor em todas as aulas deste nível.
                </p>
              </div>
            </div>
            <ol className="mt-4 grid gap-3">
              {curriculum.map((step, i) => {
                const state = kiteStageStatus(curriculumSkills, step.id);
                const last = i === curriculum.length - 1;
                return (
                  <li key={step.id} className="relative flex items-start gap-3">
                    {!last ? (
                      <span aria-hidden="true" className={'absolute left-[17px] top-9 -bottom-3 w-[2px] rounded-full '
                        + (state === 'mastered' ? 'bg-[#159c84]' : 'bg-line')} />
                    ) : null}
                    <span className={
                      'relative z-[1] grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold ' +
                      (state === 'mastered' ? 'bg-[#159c84] text-white'
                        : state === 'practiced' ? 'bg-brand text-white'
                        : 'bg-sand text-label')
                    }>
                      {state === 'mastered' ? <Icon name="check" className="!h-4 !w-4" /> : step.id}
                    </span>
                    <span className="min-w-0">
                      <strong className="block text-[14px] font-semibold text-ink">{step.title}</strong>
                      <span className="mt-0.5 block text-[12px] text-muted">{step.description}</span>
                      <span className="mt-1 block text-[11px] font-bold text-brand">
                        {state === 'mastered' ? 'Concluída'
                          : state === 'practiced' ? 'Em desenvolvimento'
                          : 'Ainda não trabalhada'}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {!journeySkillsRes.ready ? (
              <p className="mt-3 text-[12px] text-muted">O detalhamento das habilidades não está disponível no momento.</p>
            ) : null}
          </section>

          {/* Histórico de aulas */}
          <section className="mt-5 rounded-[22px] border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[18px] font-bold text-ink">Histórico de aulas</h2>
              <Link href="/aluno/aulas" className="flex items-center gap-1.5 text-[12px] font-semibold text-brand">
                Minhas aulas <Icon name="arrow" className="!h-4 !w-4" />
              </Link>
            </div>
            {doneEncounters.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">
                Suas aulas realizadas aparecerão aqui à medida que o instrutor registrar os encontros.
              </p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {doneEncounters.map(({ booking: b, meeting: m }) => {
                  const open = selected?.id === b.id;
                  const steps = skillsByMeeting.get(m.id) ?? 0;
                  return (
                    <li key={m.id}>
                      <Link
                        href={open ? '/aluno/evolucao' : `/aluno/evolucao?reserva=${b.id}#detalhes-reserva`}
                        aria-current={open ? 'page' : undefined}
                        className={'press flex items-center gap-3 rounded-[16px] border p-3 transition-colors '
                          + (open ? 'border-[#00e3ee] bg-[#07516c]' : 'border-line bg-surface')}>
                        <span className="grid h-11 w-12 shrink-0 place-items-center rounded-[12px] border border-line bg-brand-tint text-center leading-none">
                          <strong className="text-[16px] font-extrabold text-brand">
                            {new Date(m.starts_at).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit' })}
                          </strong>
                          <span className="mt-0.5 text-[9px] font-bold uppercase text-muted">
                            {new Date(m.starts_at).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza', month: 'short' }).replace('.', '')}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-[13px] font-bold text-ink">
                            {b.beach?.name ?? 'Sua praia'} · {formatMinutes(m.done_minutes)}
                          </strong>
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {formatDateLong(m.starts_at)} · {b.code}{steps ? ` · ${steps} etapa(s)` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold text-brand">
                          {open ? 'Fechar' : 'Ver'} <span aria-hidden="true">›</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Detalhe da reserva selecionada */}
          {selected ? (
            <section id="detalhes-reserva"
              className="mt-5 scroll-mt-5 rounded-[20px] border border-[#12809a] bg-[#053954] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand">
                  Detalhes da reserva
                </p>
                <Link href="/aluno/evolucao"
                  className="text-[13px] font-semibold text-brand underline">
                  Fechar detalhes
                </Link>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <h2 className="break-all text-[20px] font-extrabold text-ink">{selected.code}</h2>
                <ProgressStatus label={evolutionBookingStatus(selected)} />
              </div>
              <p className="mt-2 text-[13px] text-muted">
                {selected.beach?.name ?? 'Praia'} · {KITE_LEVEL_BADGES[selected.level].label}
                {selected.instructor?.full_name
                  ? ` · Instrutor: ${selected.instructor.full_name}` : ''}
              </p>

              {selected.status === 'awaiting_payment' ? (
                <p className="mt-4 rounded-[14px] border border-line p-3 text-[13px] text-label">
                  {VALIDATION_WITHOUT_CHECKOUT
                    ? 'Confirme sua aula na reserva para começar a validação sem cobrança.'
                    : 'Esta reserva está aguardando pagamento. A evolução começará após a confirmação.'}
                </p>
              ) : null}
              {selected.status === 'cancelled' ? (
                <p className="mt-4 rounded-[14px] border border-line p-3 text-[13px] text-label">
                  Reserva cancelada. Eventuais aulas já registradas continuam no histórico.
                </p>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <ReservationMetric label="Horas contratadas" value={formatMinutes(contracted)} />
                <ReservationMetric label="Horas realizadas" value={formatMinutes(doneMinutes)} />
                <ReservationMetric label="Horas agendadas" value={formatMinutes(scheduledMinutes)} />
                <ReservationMetric label="Saldo desta reserva" value={formatMinutes(balance)} />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-ink">Horas realizadas</p>
                  <span className="tabular text-[14px] font-extrabold text-brand">{percentHours}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-track"
                  role="progressbar" aria-label="Horas realizadas na reserva selecionada"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentHours}>
                  <span className="block h-full rounded-full bg-brand"
                    style={{ width: `${percentHours}%` }} />
                </div>
              </div>

              {assessment ? (
                <div className="mt-4 rounded-[16px] border border-line bg-brand-tint p-3">
                  <p className="text-[13px] font-bold text-ink">
                    Avaliação final do instrutor: {KITE_LEVEL_BADGES[assessment.assessed_level].label}
                    {' · '}{KITE_LEVEL_BADGES[assessment.assessed_level].metal}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    Registrada após a conclusão da reserva. Não é uma certificação externa.
                  </p>
                </div>
              ) : null}

              <div className="mt-5 border-t border-line pt-4">
                <h3 className="flex items-center gap-2 text-[17px] font-bold text-ink">
                  <Icon name="calendar" className="!h-5 !w-5 text-brand" />
                  Encontros · {sortedMeetings.length}
                </h3>
                {sortedMeetings.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted">
                    Os encontros aparecerão quando forem agendados.
                  </p>
                ) : (
                  <ol className="mt-3 grid gap-2">
                    {sortedMeetings.map((meeting) => {
                      const done = meeting.status === 'done';
                      const practiced = registeredSkills.filter(
                        (entry) => entry.meeting_id === meeting.id);
                      const priorComplete = selected.booking_meetings.every(
                        (prior) => prior.position >= meeting.position || prior.status === 'done');
                      const meetingDay = new Date(meeting.starts_at).toLocaleDateString('en-CA', {
                        timeZone: 'America/Fortaleza',
                      });
                      const canStart = selected.status === 'confirmed'
                        && meeting.status === 'scheduled'
                        && priorComplete && meetingDay <= todayCeara;
                      const status = done ? 'Concluído'
                        : meeting.status === 'in_progress' ? 'Em aula'
                        : meeting.status === 'cancelled' ? 'Cancelado'
                        : finished ? 'Encerrado'
                        : canStart ? 'Disponível'
                        : meeting.status === 'scheduled' ? 'Agendado' : 'Pendente';
                      return (
                        <li key={meeting.id} id={`encontro-${meeting.id}`}
                          className={'scroll-mt-28 rounded-[14px] border border-line bg-surface p-3 ' +
                            (params.encontro === meeting.id ? 'ring-2 ring-brand' : '')}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong className="text-[13px] font-bold text-ink">
                              Encontro {meeting.position}
                            </strong>
                            <span className="text-[11px] font-semibold text-brand">{status}</span>
                          </div>
                          <p className="mt-1 text-[12px] text-muted">
                            {formatDateLong(meeting.starts_at)} às {formatTime(meeting.starts_at)}
                            {' · '}{formatMinutes(meeting.minutes)} previstas
                          </p>
                          {meeting.note ? (
                            <p className="mt-2 whitespace-pre-line text-[13px] text-label">
                              <strong>Registro do instrutor: </strong>{meeting.note}
                            </p>
                          ) : null}
                          {done ? (
                            <>
                              <p className="mt-1 text-[12px] font-semibold text-ink">
                                {formatMinutes(meeting.done_minutes)} realizadas
                              </p>
                              {practiced.length ? (
                                <ul className="mt-2 grid gap-1">
                                  {practiced.map((skill) => {
                                    const step = KITE_CURRICULA[selected.level].find(
                                      (candidate) => candidate.id === skill.step_number);
                                    return step ? (
                                      <li key={skill.step_number} className="text-[12px] text-label">
                                        {step.title} · {skill.result === 'mastered'
                                          ? 'Concluída' : 'Praticada'}
                                      </li>
                                    ) : null;
                                  })}
                                </ul>
                              ) : (
                                <p className="mt-2 text-[12px] text-muted">
                                  {skills.ready ? 'Nenhuma etapa individual registrada.'
                                    : 'O detalhamento das habilidades não está disponível.'}
                                </p>
                              )}
                            </>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              {selected.status !== 'cancelled' && selected.status !== 'awaiting_payment' ? (
                <div className="mt-5 border-t border-line pt-4">
                  <div className="flex items-start gap-3">
                    <Icon name="flag" className="!h-6 !w-6 shrink-0 text-brand" />
                    <div>
                      <h3 className="text-[18px] font-bold text-ink">Etapas desta reserva</h3>
                      <div className="mt-2">
                        <KiteLevelMedal level={selected.level}
                          assessed={assessment?.assessed_level === selected.level}/>
                      </div>
                      <p className="mt-2 text-[12px] text-muted">
                        {KITE_LEVEL_BADGES[selected.level].detail}.
                        As habilidades abaixo pertencem somente a esta reserva.
                      </p>
                    </div>
                  </div>
                  <ol className="mt-4 grid gap-3">
                    {KITE_CURRICULA[selected.level].map((step) => {
                      const state = kiteStageStatus(pathSkills, step.id);
                      return (
                        <li key={step.id} className="flex items-start gap-3">
                          <span className={
                            'grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold ' +
                            (state === 'mastered' ? 'bg-[#159c84] text-white'
                              : state === 'practiced' ? 'bg-brand text-white'
                              : 'bg-sand text-label')
                          }>
                            {state === 'mastered' ? <Icon name="check" className="!h-4 !w-4"/> : step.id}
                          </span>
                          <span className="min-w-0">
                            <strong className="block text-[14px] font-semibold text-ink">
                              {step.title}
                            </strong>
                            <span className="mt-0.5 block text-[12px] text-muted">
                              {step.description}
                            </span>
                            <span className="mt-1 block text-[11px] font-bold text-brand">
                              {state === 'mastered' ? 'Concluída'
                                : state === 'practiced' ? 'Em desenvolvimento'
                                : finished ? 'Não registrada nesta reserva' : 'Ainda não trabalhada'}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : null}

              <div className="mt-5 border-t border-line pt-3">
                <Link href={`/aluno/reserva/${selected.id}`}
                  className="text-[13px] font-semibold text-brand underline">
                  Consultar reserva e instrutor
                </Link>
              </div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
