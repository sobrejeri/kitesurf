import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminTitle, ListCard, Metric, Panel } from '@/components/admin/kit';
import { Icon } from '@/components/icon';
import { Badge, DateTile, EmptyState, Note } from '@/components/ui';
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
    .flatMap((booking) =>
      booking.booking_meetings
        .filter((m) => m.status === 'scheduled' || m.status === 'in_progress')
        .map((meeting) => ({ booking, meeting })),
    )
    .sort((a, b) => a.meeting.starts_at.localeCompare(b.meeting.starts_at));
  const doneMinutes = confirmed
    .flatMap((b) => b.booking_meetings)
    .reduce((sum, m) => sum + (m.status === 'done' ? m.done_minutes : 0), 0);
  // Each booking's frozen net, summed for display.
  const expectedNet = confirmed.reduce((sum, booking) => sum + booking.instructor_net_cents, 0);
  const firstName = viewer.fullName.split(' ')[0] ?? '';

  return (
    <>
      <AdminTitle title={`Bom dia${firstName ? `, ${firstName}` : ''}.`} subtitle="Sua programação e seus números de hoje." />

      {me?.status !== 'approved' ? (
        <Note tone="warning" className="mb-4" title={me?.status === 'paused' ? 'Perfil pausado' : 'Cadastro em análise'}>
          {me?.status === 'paused'
            ? 'Você não recebe pedidos enquanto estiver pausado. Sua posição na fila está guardada.'
            : 'Complete seu perfil profissional e marque suas praias. A operação libera os pedidos depois da análise.'}{' '}
          <Link href="/instrutor/cadastro" className="font-semibold underline">Abrir perfil</Link>
        </Note>
      ) : (
        <Link href="/instrutor/fila" className="press mb-4 flex items-center justify-between rounded-[18px] border border-line bg-[linear-gradient(120deg,#3a2316,#16223a)] px-5 py-5">
          <span className="flex items-center gap-4">
            <span className="text-[34px] font-bold leading-none text-brand">{position}º</span>
            <span className="text-[14px] font-medium text-ink">Sua posição na fila</span>
          </span>
          <span className="flex items-center gap-1 text-[12px] text-label">Como funciona <Icon name="chevron" className="!h-4 !w-4" /></span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric label="Aulas agendadas" value={String(upcoming.length)} hint="Próximos encontros" icon="calendar" tone="orange" />
        <Metric label="Horas realizadas" value={formatMinutes(doneMinutes)} hint="Tempo registrado" icon="clock" tone="blue" />
        <div className="col-span-2 lg:col-span-1">
          <Metric label="Líquido previsto" value={formatMoney(expectedNet)} hint="Reservas confirmadas" hintTone="success" icon="wallet" tone="green" />
        </div>
      </div>

      <Panel title="Próximos encontros" className="mt-4">
        {upcoming.length === 0 ? (
          <EmptyState>Nenhum encontro marcado. Mantenha praias e idiomas atualizados para receber pedidos.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {upcoming.slice(0, 8).map(({ booking, meeting }) => (
              <li key={meeting.id}>
                <ListCard href="/instrutor/aula">
                  <div className="flex items-center gap-3">
                    <DateTile day={formatDay(meeting.starts_at)} month={formatMonthTag(meeting.starts_at)} />
                    <div className="min-w-0 flex-1">
                      <Badge tone={meeting.status === 'in_progress' ? 'warning' : 'success'}>
                        {meeting.status === 'in_progress' ? 'Em aula' : 'Confirmada'}
                      </Badge>
                      <p className="mt-1 truncate text-[15px] font-semibold text-ink">{booking.student?.full_name ?? 'Aluno'}</p>
                      <p className="text-[12px] text-muted">
                        {formatTime(meeting.starts_at)} · {formatMinutes(meeting.minutes)} · {booking.beach?.name ?? '—'}
                      </p>
                    </div>
                  </div>
                </ListCard>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
