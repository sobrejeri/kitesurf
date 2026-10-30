import type { Metadata } from 'next';

import { Icon } from '@/components/icon';
import { ButtonLink, Card, EmptyState, StatCard } from '@/components/ui';
import { LEARNING } from '@/data/demo';
import { requireRole } from '@/lib/auth';
import { learningBalance, listBookingsForStudent } from '@/lib/data';
import { formatDateLong, formatMinutes } from '@/lib/format';

export const metadata: Metadata = { title: 'Minha evolução' };

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
  const ring = 2 * Math.PI * 34;

  return (
    <>
      <h1 className="mb-5 text-[28px] tracking-[-0.9px] sm:text-[32px]">Minha evolução</h1>

      <Card tone="brand" className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[19px] text-white">Seu tempo no mar</h2>
          <p className="mt-1 text-[12px] text-on-brand-muted">
            {formatMinutes(balance.done)} de {formatMinutes(balance.contracted)} realizados
          </p>
        </div>
        <div className="relative grid h-[84px] w-[84px] place-items-center">
          <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#ffffff30" strokeWidth="5" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={ring} strokeDashoffset={ring * (1 - donePercent / 100)} />
          </svg>
          <p className="text-center leading-none">
            <span className="block text-[20px] font-semibold">{donePercent}%</span>
            <span className="text-[7px] text-on-brand-muted">das horas<br />realizadas</span>
          </p>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Horas contratadas" value={formatMinutes(balance.contracted)} hint="Reservas confirmadas" icon="book" />
        <StatCard label="Horas realizadas" value={formatMinutes(balance.done)} hint={`${history.length} registro(s) de aula`} icon="check" />
        <StatCard label="Horas agendadas" value={formatMinutes(balance.scheduled)} hint="Próximos encontros" icon="calendar" />
        <StatCard label="Saldo disponível" value={formatMinutes(balance.available)} hint="Para os próximos encontros" icon="wind" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[18px]">Seu caminho no kite</h2>
              <p className="mt-1 text-[12px] text-muted">As etapas que você vai trabalhar com seu instrutor.</p>
            </div>
            <Icon name="flag" />
          </div>
          <ol className="mt-5 grid gap-0">
            {LEARNING.steps.map((step, index) => (
              <li key={step.title} className="relative flex gap-4 pb-5 last:pb-0">
                {index < LEARNING.steps.length - 1 ? (
                  <span className="absolute left-[15px] top-8 h-[calc(100%-28px)] border-l border-dashed border-line-ghost" aria-hidden="true" />
                ) : null}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-[550] text-brand">{index + 1}</span>
                <p className="pt-1.5 text-[13px] font-[550]">{step.title}</p>
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <h2 className="text-[16px]">Extrato de horas</h2>
            {history.length === 0 ? (
              <div className="mt-4"><EmptyState>Os registros aparecem aqui quando o instrutor fecha cada aula.</EmptyState></div>
            ) : (
              <ul className="mt-4 grid gap-3">
                {history.map((entry) => (
                  <li key={entry.id} className="rounded-search border border-line p-4">
                    <p className="text-[13px] font-[550] text-brand">{formatMinutes(entry.done_minutes)} de aula realizada</p>
                    <p className="text-[11px] text-muted">{formatDateLong(entry.starts_at)} · {entry.instructor}</p>
                    {entry.note ? <p className="mt-2 text-[12px] text-label">{entry.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card tone="tinted">
            <h2 className="text-[16px]">O próximo bordo te espera.</h2>
            <p className="mt-1 text-[12px] text-muted">O saldo de horas fica com o instrutor contratado.</p>
            <ButtonLink href="/aluno/aulas" className="mt-4" trailingIcon="arrow">Ver minhas aulas</ButtonLink>
          </Card>
        </div>
      </div>
    </>
  );
}
