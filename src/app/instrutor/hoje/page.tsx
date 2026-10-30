import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { Toggle } from '@/components/interactive';
import { SectionTitle } from '@/components/shared';
import { Badge, ButtonLink, DateTile, StatCard } from '@/components/ui';
import { BOOKING, INSTRUCTOR, LEARNING } from '@/data/demo';
import { formatMinutes, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Meu dia' };

export default function InstructorTodayPage() {
  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[28px] tracking-[-0.9px] sm:text-[32px]">Bom dia, {INSTRUCTOR.firstName}.</h1>
        <Toggle label="Disponível para pedidos" />
      </header>

      <Link href="/instrutor/fila" className="flex items-center justify-between rounded-card border border-line bg-brand-tint px-6 py-6">
        <span className="flex items-center gap-4">
          <span className="text-[22px] font-semibold text-brand">1º</span>
          <span className="text-[13px] font-[550] text-brand">Sua posição na fila</span>
        </span>
        <span className="flex items-center gap-1 text-[11px] font-[550] text-label">
          Como funciona <Icon name="chevron" className="!h-4 !w-4" />
        </span>
      </Link>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Aulas agendadas" value="1" hint="Sua programação" icon="calendar" />
        <StatCard label="Horas realizadas" value={formatMinutes(LEARNING.doneMinutes)} hint="Tempo registrado em aula" icon="clock" />
        <StatCard label="Líquido previsto" value={formatMoney(BOOKING.instructorNetCents)} hint="Reservas demonstrativas" icon="wallet" />
        <StatCard label="Avaliação dos alunos" value={INSTRUCTOR.rating} hint={`${INSTRUCTOR.ratingCount} avaliações de exemplo`} icon="star" />
      </div>

      <div className="mt-8">
        <SectionTitle title="Próximos encontros" action={{ label: 'Ver agenda', href: '/instrutor/agenda' }} />
        <p className="-mt-2 mb-4 text-[12px] text-muted">Prepare-se para acompanhar cada aluno.</p>
        <article className="flex flex-wrap items-center gap-4 rounded-card border border-[#f4e8d2] bg-[#fffdf6] p-4 sm:p-5">
          <DateTile day={BOOKING.day} month={BOOKING.month} />
          <div className="min-w-0 flex-1">
            <Badge>{BOOKING.status}</Badge>
            <p className="mt-1.5 text-[15px] font-[550]">{BOOKING.title} · {BOOKING.durationLabel}</p>
            <p className="text-[11px] text-muted">Luana · {BOOKING.beach} · {BOOKING.time}</p>
          </div>
          <div className="flex gap-2">
            <ButtonLink href="/instrutor/aula" variant="ghost" size="sm" trailingIcon="arrow">Ver aula</ButtonLink>
            <ButtonLink href="/instrutor/atendimento" variant="ghost" size="sm" icon="chat">Chat</ButtonLink>
          </div>
        </article>
      </div>
    </>
  );
}
