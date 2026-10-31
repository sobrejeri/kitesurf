import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminTitle, Metric, Panel, PhotoTile } from '@/components/admin/kit';
import { BOOKING_STATUS } from '@/components/admin/labels';
import { Badge, EmptyState, Note } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllBookings, listAllInstructors, listPriceVersions } from '@/lib/data';
import { formatDateShort, formatMoney, formatTime } from '@/lib/format';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Transporte de apoio' };

/**
 * The support vehicle is the instructor's own and has no schedule of its own:
 * this screen shows who offers one, the current rate and the bookings that
 * asked for it.
 */
export default async function TransportPage() {
  await requireRole(['admin'], '/admin/transporte');
  const [instructors, bookings, prices] = await Promise.all([listAllInstructors(), listAllBookings(500), listPriceVersions()]);
  const withVehicle = instructors.filter((row) => row.has_support_vehicle);
  const withTransport = bookings.filter((booking) => booking.with_transport && booking.status !== 'cancelled');
  const rate = prices[0]?.transport_hourly_cents ?? 0;

  return (
    <>
      <AdminTitle title="Transporte de apoio" subtitle="Veículo do instrutor, cobrado por hora de aula." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric label="Tarifa atual" value={rate > 0 ? `${formatMoney(rate)}/h` : 'Desligado'} hint="Muda em Regras da operação" icon="car" tone="orange" />
        <Metric label="Instrutores com veículo" value={String(withVehicle.length)} hint="Marcado no perfil" icon="users" tone="blue" />
        <div className="col-span-2 lg:col-span-1">
          <Metric label="Reservas com transporte" value={String(withTransport.length)} hint="Não canceladas" icon="book" tone="green" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Instrutores com veículo">
          {withVehicle.length === 0 ? (
            <EmptyState>Nenhum instrutor marcou veículo de apoio no perfil.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {withVehicle.map((row) => (
                <li key={row.id}>
                  <Link href={`/admin/instrutores/${row.id}`} className="flex items-center gap-3 py-3">
                    <PhotoTile initials={initials(row.profile?.full_name)} size={40} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[14px] font-medium text-ink">{row.profile?.full_name}</strong>
                      <span className="text-[12px] text-muted">{row.beaches.map((b) => b.name).join(', ') || 'Sem praia'}</span>
                    </span>
                    <Badge tone={row.status === 'approved' ? 'success' : 'quiet'}>{row.status === 'approved' ? 'Aprovado' : 'Não aprovado'}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Reservas com transporte">
          {withTransport.length === 0 ? (
            <EmptyState>Nenhuma reserva pediu transporte de apoio ainda.</EmptyState>
          ) : (
            <ul className="grid gap-2">
              {withTransport.map((booking) => {
                const first = booking.booking_meetings[0];
                return (
                  <li key={booking.id}>
                    <Link href={`/admin/reservas/${booking.id}`} className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3">
                      <span className="min-w-0">
                        <strong className="block truncate text-[14px] font-semibold text-ink">
                          #{booking.code.replace('VNT-', '')} · {booking.instructor?.full_name ?? '—'}
                        </strong>
                        <span className="text-[12px] text-muted">
                          {first ? `${formatDateShort(first.starts_at)} · ${formatTime(first.starts_at)} · ` : ''}
                          {booking.beach?.name ?? '—'}
                        </span>
                      </span>
                      <span className="text-right">
                        <strong className="tabular block text-[14px] font-bold text-ink">{formatMoney(booking.transport_cents)}</strong>
                        <Badge tone={BOOKING_STATUS[booking.status].tone}>{BOOKING_STATUS[booking.status].label}</Badge>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
      <Note className="mt-4">
        O valor do transporte vai inteiro para o instrutor, sem comissão da plataforma nem da pousada. A operação não controla agenda do veículo.
      </Note>
    </>
  );
}
