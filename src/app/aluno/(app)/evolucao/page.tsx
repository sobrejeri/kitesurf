import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { StudentHero } from '@/components/student/sunset';
import { KiteLevelMedal } from '@/components/student/kite-level-medal';
import { requireRole } from '@/lib/auth';
import {
  listBookingsForStudent,
  type StudentBooking,
} from '@/lib/data';
import {
  bookingIsFinished,
  evolutionBookingStatus,
  selectedStudentBooking,
} from '@/lib/booking-cycle';
import { getBookingProgress } from '@/lib/booking-progress';
import { getBookingLevelAssessments, type BookingLevelAssessment } from '@/lib/booking-level-assessments';
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

function BookingPreview({
  booking,
  expanded,
}: {
  booking: StudentBooking;
  expanded: boolean;
}) {
  const progress = getBookingProgress(booking.booking_meetings);
  const label = evolutionBookingStatus(booking);
  const next = [...booking.booking_meetings]
    .filter((meeting) => meeting.status === 'scheduled' || meeting.status === 'in_progress')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  return (
    <Link
      href={expanded ? `/aluno/evolucao#reserva-${booking.id}` :
        `/aluno/evolucao?reserva=${booking.id}#reserva-${booking.id}`}
      aria-current={expanded ? 'page' : undefined}
      className={
        'press block rounded-[18px] border p-4 transition-colors ' +
        (expanded
          ? 'border-[#00e3ee] bg-[#07516c] shadow-[0_4px_18px_#00182777]'
          : 'border-line bg-surface')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-[15px] font-bold text-ink">{booking.code}</p>
            {expanded ? (
              <span className="rounded-full border border-[#00e3ee]/60 bg-[#00e3ee]/15 px-2 py-0.5 text-[10px] font-bold text-[#9af8fb]">
                Detalhes abertos
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-label">
            {booking.beach?.name ?? 'Praia'} · {KITE_LEVEL_BADGES[booking.level].label}
          </p>
        </div>
        <ProgressStatus label={label} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-muted">
        <span>
          {formatMinutes(booking.total_hours * 60)} contratadas
          {next ? ` · Próximo: ${formatDateLong(next.starts_at)}` : ''}
        </span>
        <span className="shrink-0 font-semibold text-brand">
          {expanded ? 'Fechar' : 'Ver detalhes'} <span aria-hidden="true">›</span>
        </span>
      </div>
      {booking.status !== 'awaiting_payment' && booking.status !== 'cancelled' &&
        progress.total > 0 ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track"
            role="progressbar" aria-label="Progresso dos encontros"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
            <span className="block h-full rounded-full bg-brand"
              style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="tabular shrink-0 text-[11px] text-label">
            {progress.completed}/{progress.total} encontros
          </span>
        </div>
      ) : null}
    </Link>
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
  const [bookings, params] = await Promise.all([
    listBookingsForStudent(viewer.id),
    searchParams,
  ]);

  // Never select a reservation automatically, not even the first active one.
  // listBookingsForStudent is scoped to this authenticated student under RLS.
  const selected = selectedStudentBooking(bookings, params.reserva);
  const finished = selected ? bookingIsFinished(selected) : false;

  // The detailed queries are only needed after the student opens a booking.
  const [skills, reviews] = selected
    ? await Promise.all([
      getMeetingKiteSkills(selected.booking_meetings.map((meeting) => meeting.id)),
      getBookingLevelAssessments(finished ? [selected.id] : []),
    ])
    : [
      { ready: true, rows: [] },
      { ready: true, assessments: new Map<string, BookingLevelAssessment>() },
    ];
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

  return (
    <>
      <StudentHero image="coast" eyebrow="Sua evolução no mar"
        title="Minha evolução" highlight="evolução"
        lead="Selecione uma reserva para ver seus encontros, horas e evolução no kite."
        compact />

      <section id="minhas-reservas"
        className="relative -mt-2 scroll-mt-6 rounded-[22px] border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-bold text-ink">Minhas reservas</h2>
          <span className="text-[12px] text-muted">{bookings.length} no total</span>
        </div>
        <p className="mt-1 text-[12px] text-muted">
          Toque em uma reserva para consultar os detalhes. As outras ficam recolhidas.
        </p>
        {bookings.length === 0 ? (
          <div className="mt-4 rounded-[16px] border border-line p-4">
            <p className="text-[13px] text-muted">Você ainda não possui reservas.</p>
            <Link href="/aluno/reservar"
              className="mt-3 inline-block text-[13px] font-bold text-brand underline">
              Agendar minha primeira aula
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {bookings.map((booking) => (
              <div id={`reserva-${booking.id}`} key={booking.id}
                className={'grid gap-2 scroll-mt-28 rounded-[22px] transition-colors ' +
                  (selected?.id === booking.id
                    ? 'bg-[#064862] p-1.5 ring-2 ring-[#00e3ee]/80 shadow-[0_12px_30px_#000e206e]'
                    : '')}>
                <BookingPreview booking={booking}
                  expanded={selected?.id === booking.id} />
                {selected?.id === booking.id ? (
                  <>
        <section id="detalhes-reserva"
          className="scroll-mt-5 rounded-[20px] border border-[#12809a] bg-[#053954] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand">
              Detalhes da reserva
            </p>
            <Link href={`/aluno/evolucao#reserva-${selected.id}`}
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
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

    </>
  );
}
