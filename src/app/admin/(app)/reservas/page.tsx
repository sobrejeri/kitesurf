import type { Metadata } from 'next';

import { FilterList, type FilterEntry } from '@/components/admin/filter-list';
import { BookingProgress } from '@/components/admin/booking-progress';
import { AdminTitle, ListCard } from '@/components/admin/kit';
import { BOOKING_STATUS } from '@/components/admin/labels';
import { Icon } from '@/components/icon';
import { Avatar, Badge } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllBookings } from '@/lib/data';
import { formatDateShort, formatMoney, formatTime } from '@/lib/format';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Reservas' };

export default async function BookingsPage() {
  await requireRole(['admin'], '/admin/reservas');
  const bookings = await listAllBookings(300);

  const entries: FilterEntry[] = bookings.map((booking) => {
    const first = booking.booking_meetings[0];
    const student = booking.student?.full_name || 'Aluno';
    const status = BOOKING_STATUS[booking.status];
    return {
      key: booking.id,
      groups: [booking.status],
      text: `${booking.code} ${student} ${booking.instructor?.full_name ?? ''} ${booking.beach?.name ?? ''}`.toLowerCase(),
      node: (
        <ListCard href={`/admin/reservas/${booking.id}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[15px] font-semibold text-ink">#{booking.code.replace('VNT-', '')}{booking.is_test ? ' · TESTE' : ''}</p>
              {first ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-label">
                  <Icon name="clock" className="!h-3.5 !w-3.5" />
                  {formatDateShort(first.starts_at)} · {formatTime(first.starts_at)}
                </p>
              ) : null}
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Avatar initials={initials(student)} size={38} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-ink">{student}</p>
              <p className="text-[12px] text-muted">Aula particular · {booking.total_hours}h</p>
              <p className="mt-0.5 flex items-center gap-1 text-[12px] text-label">
                <Icon name="pin" className="!h-3.5 !w-3.5" /> {booking.beach?.name ?? '—'}
              </p>
            </div>
            <p className="tabular self-end text-[16px] font-bold text-ink">{formatMoney(booking.total_cents)}</p>
          </div>
          <BookingProgress meetings={booking.booking_meetings} bookingStatus={booking.status} />
        </ListCard>
      ),
    };
  });

  return (
    <>
      <AdminTitle title="Reservas" subtitle={`${bookings.length} reservas`} />
      <FilterList
        placeholder="Buscar reserva, aluno ou instrutor..."
        empty="Nenhuma reserva encontrada."
        chips={[
          { id: 'awaiting_payment', label: 'Pendentes' },
          { id: 'confirmed', label: 'Confirmadas' },
          { id: 'completed', label: 'Concluídas' },
        ]}
        entries={entries}
      />
    </>
  );
}
