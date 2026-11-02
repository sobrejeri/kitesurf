import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon, type IconName } from '@/components/icon';
import { StudentHero, SunsetEmpty } from '@/components/student/sunset';
import { requireRole } from '@/lib/auth';
import { learningBalance, listBookingsForStudent } from '@/lib/data';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import { KITE_CURRICULA, KITE_LEVEL_BADGES, kiteStageStatus } from '@/lib/kite-steps';
import { KiteLevelMedal } from '@/components/student/kite-level-medal';
import { getStudentKiteLevel } from '@/lib/student-kite-level';
import { getMeetingKiteSkills } from '@/lib/meeting-skills';

export const metadata: Metadata = { title: 'Minha evolução' };


function Stat({ label, value, hint, icon, href }: { label: string; value: string; hint: string; icon: IconName; href: string }) {
  return (
    <Link href={href} className="press rounded-[20px] border border-line bg-surface p-4">
      <span className="flex items-center gap-2.5 text-[13px] text-label">
        <Icon name={icon} className="!h-6 !w-6 text-brand" />
        {label}
      </span>
      <span className="mt-3 flex items-center justify-between gap-2">
        <span className="tabular text-[30px] font-bold leading-none tracking-[-0.8px] text-ink">{value}</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-sand text-label">
          <Icon name="chevron" className="!h-4 !w-4" />
        </span>
      </span>
      <span className="mt-2 block text-[12px] text-muted">{hint}</span>
    </Link>
  );
}

export default async function ProgressPage() {
  const viewer = await requireRole(['student'], '/aluno/evolucao');
  const bookings = await listBookingsForStudent(viewer.id);
  const levelRecord = await getStudentKiteLevel(viewer.id);
  const currentLevel = levelRecord.effective;
  const currentCurriculum = KITE_CURRICULA[currentLevel];
  const balance = learningBalance(bookings);
  const meetingIds = bookings.flatMap((booking) => booking.booking_meetings.map((m) => m.id));
  const skills = await getMeetingKiteSkills(meetingIds);
  const allSkills = skills.rows;
  const relevantMeetingIds = new Set(bookings.filter((booking) => booking.level === currentLevel)
    .flatMap((booking) => booking.booking_meetings.filter((meeting) => meeting.status === 'done').map((meeting) => meeting.id)));
  const currentSkills = allSkills.filter((entry) => relevantMeetingIds.has(entry.meeting_id));
  const todayInCeara = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const dateInCeara = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
  const encounters = bookings
    .filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
    .flatMap((booking) => booking.booking_meetings.map((meeting) => {
      const priorComplete = booking.booking_meetings
        .every((previous) => previous.position >= meeting.position || previous.status === 'done');
      const unlocked = meeting.status === 'done' || meeting.status === 'in_progress'
        || (meeting.status === 'scheduled' && priorComplete && dateInCeara(meeting.starts_at) <= todayInCeara);
      return {
        booking, meeting, unlocked, priorComplete,
        skills: allSkills.filter((r) => r.meeting_id === meeting.id),
      };
    }))
    .sort((a, b) => a.meeting.starts_at.localeCompare(b.meeting.starts_at));
  const donePercent = balance.contracted ? Math.round((balance.done / balance.contracted) * 100) : 0;
  const history = bookings
    .flatMap((booking) =>
      booking.booking_meetings
        .filter((meeting) => meeting.status === 'done')
        .map((meeting) => ({ ...meeting, instructor: booking.instructor?.full_name ?? '' })),
    )
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const ring = 2 * Math.PI * 42;

  return (
    <>
      <StudentHero
        image="coast"
        eyebrow="Sua evolução no mar"
        title="Minha evolução"
        highlight="evolução"
        lead="Cada hora no mar te leva mais longe. Acompanhe sua jornada aqui."
        compact
      />

      <section className="relative -mt-2 rounded-[22px] border border-line bg-surface p-5">
        <p className="flex items-center gap-2.5 text-[17px] font-semibold text-ink">
          <Icon name="waves" className="!h-6 !w-6 text-brand" /> Seu tempo no mar
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-3">
              <Icon name="clock" className="!h-7 !w-7 text-brand" />
              <span className="tabular text-[40px] font-bold leading-none tracking-[-1px] text-ink">{formatMinutes(balance.done)}</span>
            </p>
            <p className="mt-2 pl-10 text-[14px] text-label">de {formatMinutes(balance.contracted)} realizados</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={donePercent}>
              <span className="block h-full rounded-full bg-brand" style={{ width: `${donePercent}%` }} />
            </div>
          </div>
          <div className="relative grid h-[104px] w-[104px] shrink-0 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-track)" strokeWidth="7" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-brand)" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={ring} strokeDashoffset={ring * (1 - donePercent / 100)} />
            </svg>
            <p className="text-center leading-none">
              <span className="block text-[24px] font-bold text-ink">{donePercent}%</span>
              <span className="text-[10px] text-label">das horas<br />realizadas</span>
            </p>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Horas contratadas" value={formatMinutes(balance.contracted)} hint="Reservas confirmadas" icon="calendar" href="/aluno/aulas" />
        <Stat label="Horas realizadas" value={formatMinutes(balance.done)} hint={`${history.length} registro(s) de aula`} icon="chart" href="/aluno/evolucao" />
        <Stat label="Horas agendadas" value={formatMinutes(balance.scheduled)} hint="Próximos encontros" icon="calendar" href="/aluno/aulas" />
        <Stat label="Saldo disponível" value={formatMinutes(balance.available)} hint="Para os próximos encontros" icon="wallet" href="/aluno/reservar" />
      </div>

      <section className="mt-5 rounded-[22px] border border-line bg-surface p-5">
        <h2 className="flex items-center gap-3 text-[19px] font-bold text-ink">
          <Icon name="calendar" className="!h-6 !w-6 text-brand" />
          Sua evolução por encontro
        </h2>
        <p className="mt-2 text-[13px] text-muted">
          Cada aula fica disponível no dia marcado e após a conclusão da anterior.
          O instrutor registra o que foi praticado ao encerrar cada encontro.
        </p>
        {encounters.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line p-4 text-[13px] text-muted">
            Você ainda não tem encontros confirmados.
          </p>
        ) : (
          <ol className="mt-5 grid gap-3">
            {encounters.map(({ booking, meeting, unlocked, priorComplete, skills: meetingSkills }) => {
              const done = meeting.status === 'done';
              const inProgress = meeting.status === 'in_progress';
              const locked = !unlocked;
              return (
                <li key={meeting.id} className={
                  'rounded-[17px] border p-4 ' +
                  (done ? 'border-[#1aa691] bg-[#053c42]' :
                    inProgress ? 'border-[#e78936] bg-[#41301d]' :
                    locked ? 'border-line bg-surface/75' : 'border-brand bg-brand-tint')
                }>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[15px] font-bold text-ink">
                      Encontro {meeting.position} de {booking.booking_meetings.length}
                    </strong>
                    <span className={
                      'rounded-full px-3 py-1 text-[11px] font-bold ' +
                      (done ? 'bg-[#126553] text-[#bdffe7]' :
                        inProgress ? 'bg-[#87521f] text-[#fff1d5]' :
                        locked ? 'bg-sand text-label' : 'bg-brand-tint text-brand')
                    }>
                      {done ? 'Concluído' : inProgress ? 'Em aula' : locked ? 'Bloqueado' : 'Disponível'}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-label">
                    {formatDateLong(meeting.starts_at)} às {formatTime(meeting.starts_at)}
                    {' · '}{formatMinutes(meeting.minutes)} agendados
                  </p>
                  {done ? (
                    <>
                      <p className="mt-2 text-[13px] font-semibold text-brand">
                        {formatMinutes(meeting.done_minutes)} realizados
                      </p>
                      {meetingSkills.length ? (
                        <ul className="mt-3 grid gap-2">
                          {meetingSkills.map((skill) => {
                            const step = KITE_CURRICULA[booking.level].find((item) => item.id === skill.step_number);
                            return step ? (
                              <li key={step.id} className="flex gap-2 text-[12px] text-ink">
                                <Icon name="check" className="!h-4 !w-4 shrink-0 text-brand" />
                                <span>{step.title} · {skill.result === 'mastered' ? 'Concluída' : 'Praticada'}</span>
                              </li>
                            ) : null;
                          })}
                        </ul>
                      ) : (
                        <p className="mt-2 text-[12px] text-muted">
                          {skills.ready
                            ? 'Nenhuma etapa individual foi registrada neste encontro.'
                            : 'O detalhamento das etapas estará disponível após a atualização do sistema.'}
                        </p>
                      )}
                    </>
                  ) : locked ? (
                    <p className="mt-2 text-[12px] text-muted">
                      {priorComplete ? 'Disponível a partir do dia agendado.' :
                        'Conclua o encontro anterior para liberar esta etapa.'}
                    </p>
                  ) : (
                    <p className="mt-2 text-[12px] text-label">
                      {inProgress ? 'O instrutor está realizando este encontro.' :
                        'O encontro está disponível; as etapas aparecerão após o registro do instrutor.'}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section className="relative overflow-hidden rounded-[22px] border border-line bg-surface p-5">
          <span className="absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,#ff7a1a33,transparent_65%)]" aria-hidden="true" />
          <div className="relative flex items-start gap-3">
            <Icon name="flag" className="!h-7 !w-7 text-brand" />
            <div>
              <h2 className="text-[20px] font-bold text-ink">Seu caminho no kite</h2>
              <div className="mt-2"><KiteLevelMedal level={currentLevel}
                assessed={levelRecord.assessed !== null}/></div>
              <p className="mt-2 text-[13px] text-muted">
                {KITE_LEVEL_BADGES[currentLevel].detail}. As etapas abaixo correspondem
                ao seu nível atual; o instrutor adapta a aula às condições.
              </p>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-label">
            Etapas avançadas podem representar especializações distintas;
            não é obrigatório dominar todas para seguir uma modalidade.
          </p>
          <p className="mt-3 text-[12px] text-label">
            As etapas são registradas pelo instrutor. Praticada indica desenvolvimento;
            concluída indica que a habilidade já foi alcançada.
          </p>
          <ol className="relative mt-5">
            {currentCurriculum.map((step, index) => {
              const state = kiteStageStatus(currentSkills, step.id);
              return (
                <li key={step.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {index < KITE_STEPS.length - 1 ? (
                    <span className="absolute left-[19px] top-10 h-[calc(100%-40px)] w-px bg-line-ghost"
                      aria-hidden="true" />
                  ) : null}
                  <span className={
                    'relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold ' +
                    (state === 'mastered' ? 'bg-[#159c84] text-white' :
                      state === 'practiced' ? 'bg-brand text-white' : 'bg-sand text-label')
                  }>
                    {state === 'mastered' ? <Icon name="check" className="!h-5 !w-5" /> : step.id}
                  </span>
                  <span className="min-w-0 pt-1">
                    <strong className="block text-[15px] font-semibold text-ink">{step.title}</strong>
                    <span className="mt-1 block text-[13px] text-muted">{step.description}</span>
                    <span className="mt-2 block text-[11px] font-bold text-brand">
                      {state === 'mastered' ? 'Concluída' :
                        state === 'practiced' ? 'Em desenvolvimento' : 'Ainda não trabalhada'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="self-start rounded-[22px] border border-line bg-surface p-5">
          <h2 className="mb-4 flex items-center gap-3 text-[20px] font-bold text-ink">
            <Icon name="chart" className="!h-6 !w-6 text-brand" /> Extrato de horas
          </h2>
          {history.length === 0 ? (
            <SunsetEmpty icon="clock">Os registros aparecem aqui quando o instrutor fecha cada aula.</SunsetEmpty>
          ) : (
            <ul className="grid gap-3">
              {history.map((entry) => (
                <li key={entry.id} className="rounded-search border border-line p-4">
                  <p className="text-[14px] font-semibold text-brand">{formatMinutes(entry.done_minutes)} de aula realizada</p>
                  <p className="text-[12px] text-muted">{formatDateLong(entry.starts_at)} · {entry.instructor}</p>
                  {entry.note ? <p className="mt-2 text-[13px] text-label">{entry.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
