import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon, type IconName } from '@/components/icon';
import { StudentHero, SunsetEmpty } from '@/components/student/sunset';
import { requireRole } from '@/lib/auth';
import { learningBalance, listBookingsForStudent } from '@/lib/data';
import { formatDateLong, formatMinutes } from '@/lib/format';

export const metadata: Metadata = { title: 'Minha evolução' };

const STEPS = [
  ['Conhecer os equipamentos', 'Entenda o kite, a prancha e os acessórios.'],
  ['Entender o vento e a janela de voo', 'Como o vento funciona e a zona segura de pilotagem.'],
  ['Controlar o kite', 'Exercícios de controle na areia e na água, com segurança.'],
  ['Body drag', 'Ganhe confiança no mar controlando o kite com o corpo.'],
  ['Waterstart', 'Aprenda a levantar da água e começar a velejar.'],
  ['Primeiros bordos', 'Mantenha o controle e faça seus primeiros percursos.'],
] as const;

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
  const balance = learningBalance(bookings);
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

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section className="relative overflow-hidden rounded-[22px] border border-line bg-surface p-5">
          <span className="absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,#ff7a1a33,transparent_65%)]" aria-hidden="true" />
          <div className="relative flex items-start gap-3">
            <Icon name="flag" className="!h-7 !w-7 text-brand" />
            <div>
              <h2 className="text-[20px] font-bold text-ink">Seu caminho no kite</h2>
              <p className="text-[13px] text-muted">As etapas que você vai trabalhar com seu instrutor.</p>
            </div>
          </div>
          <ol className="relative mt-5">
            {STEPS.map(([title, body], index) => (
              <li key={title} className="relative flex gap-4 pb-5 last:pb-0">
                {index < STEPS.length - 1 ? (
                  <span className={`absolute left-[19px] top-10 h-[calc(100%-40px)] w-px ${index === 0 ? 'bg-brand' : 'bg-line-ghost'}`} aria-hidden="true" />
                ) : null}
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold ${index === 0 ? 'bg-brand text-white shadow-button' : 'bg-sand text-label'}`}>
                  {index + 1}
                </span>
                <span className="pt-1">
                  <strong className="block text-[15px] font-semibold text-ink">{title}</strong>
                  <span className="text-[13px] text-muted">{body}</span>
                </span>
              </li>
            ))}
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
