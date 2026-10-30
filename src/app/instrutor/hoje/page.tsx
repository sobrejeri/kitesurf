import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { SectionTitle } from '@/components/shared';
import { Badge, ButtonLink, DateTile, EmptyState, Note, StatCard } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getOwnInstructor, listBookingsForInstructor, listQueue } from '@/lib/data';
import { formatDay, formatMinutes, formatMoney, formatMonthTag, formatTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Meu dia' };

export default async function InstructorTodayPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/hoje');
  const [me, bookings, queue] = await Promise.all([
    getOwnInstructor(viewer.id),
    listBookingsForInstructor(viewer.id),
    listQueue(),
  ]);
  const position = queue.findIndex((row) => row.id === viewer.id) + 1;
  const confirmed = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed');
  const upcoming = confirmed
    .flatMap((booking) => booking.booking_meetings.filter((m) => m.status === 'scheduled' || m.status === 'in_progress').map((m) => ({ booking, meeting: m })))
    .sort((a, b) => a.meeting.starts_at.localeCompare(b.meeting.starts_at));
  const doneMinutes = confirmed.flatMap((b) => b.booking_meetings).reduce((sum, m) => sum + (m.status === 'done' ? m.done_minutes : 0), 0);
  // Already-computed nets from each booking's frozen snapshot, summed for display.
  const expectedNet = confirmed.reduce((sum, booking) => sum + booking.instructor_net_cents, 0);
  const firstName = viewer.fullName.split(' ')[0] ?? '';

  return (
    <>
      <h1 className="mb-6 text-[28px] tracking-[-0.9px] sm:text-[32px]">Bom dia{firstName ? `, ${firstName}` : ''}.</h1>

      {me?.status !== 'approved' ? (
        <Note tone="warning" className="mb-5" title={me?.status === 'paused' ? 'Perfil pausado' : 'Cadastro em análise'}>
          {me?.status === 'paused'
            ? 'Você não recebe pedidos enquanto estiver pausado. Sua posição na fila está guardada.'
            : 'Complete seu perfil profissional. A operação libera os pedidos depois da análise.'}{' '}
          <Link href="/instrutor/cadastro" className="font-[550] underline">Abrir perfil</Link>
        </Note>
      ) : (
        <Link href="/instrutor/fila" className="flex items-center justify-between rounded-card border border-line bg-brand-tint px-6 py-6">
          <span className="flex items-center gap-4">
            <span className="text-[22px] font-semibold text-brand">{position}º</span>
            <span className="text-[13px] font-[550] text-brand">Sua posição na fila</span>
          </span>
          <span className="flex items-center gap-1 text-[11px] font-[550] text-label">Como funciona <Icon name="chevron" className="!h-4 !w-4" /></span>
        </Link>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Aulas agendadas" value={String(upcoming.length)} hint="Sua programação" icon="calendar" />
        <StatCard label="Horas realizadas" value={formatMinutes(doneMinutes)} hint="Tempo registrado em aula" icon="clock" />
        <StatCard label="Líquido previsto" value={formatMoney(expectedNet)} hint="Reservas confirmadas" icon="wallet" />
      </div>

      <div className="mt-8">
        <SectionTitle title="Próximos encontros" action={{ label: 'Registrar aula', href: '/instrutor/aula' }} />
        {upcoming.length === 0 ? (
          <EmptyState>Nenhum encontro marcado. Mantenha seu perfil atualizado para receber pedidos.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {upcoming.slice(0, 6).map(({ booking, meeting }) => (
              <li key={meeting.id} className="flex flex-wrap items-center gap-4 rounded-card border border-[#f4e8d2] bg-[#fffdf6] p-4 sm:p-5">
                <DateTile day={formatDay(meeting.starts_at)} month={formatMonthTag(meeting.starts_at)} />
                <div className="min-w-0 flex-1">
                  <Badge>{meeting.status === 'in_progress' ? 'Em aula' : 'Confirmada'}</Badge>
                  <p className="mt-1.5 text-[15px] font-[550]">Aula particular de kitesurf · {formatMinutes(meeting.minutes)}</p>
                  <p className="text-[11px] text-muted">
                    {booking.student?.full_name ?? 'Aluno'} · {(booking.beach?.name ?? '—')} · {formatTime(meeting.starts_at)} · {booking.code}
                  </p>
                </div>
                <ButtonLink href="/instrutor/aula" variant="ghost" size="sm" trailingIcon="arrow">Ver aula</ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
