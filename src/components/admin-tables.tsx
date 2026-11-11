import { BOOKING_STATUS_LABELS, type Booking } from '@/lib/data';
import { formatDateShort, formatMoney, formatTime } from '@/lib/format';

import { Badge, EmptyState } from './ui';

const TONE = { awaiting_payment: 'warning', confirmed: 'success', completed: 'quiet', cancelled: 'danger' } as const;

export function AdminBookingsTable({ bookings }: { bookings: readonly Booking[] }) {
  if (bookings.length === 0) return <div className="p-4"><EmptyState>Nenhuma reserva ainda.</EmptyState></div>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[680px] text-left">
        <thead>
          <tr className="bg-sand text-[10.5px] uppercase tracking-[.5px] text-muted">
            {['Reserva', 'Aluno e instrutor', 'Primeiro encontro', 'Total', 'Situação'].map((head) => (
              <th key={head} className="px-4 py-3 font-medium">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-[12.5px] text-label">
          {bookings.map((booking) => {
            const first = booking.booking_meetings[0];
            return (
              <tr key={booking.id} className="border-t border-line">
                <td className="px-4 py-4">
                  <strong className="block font-[550] text-brand">{booking.code}</strong>
                  {booking.total_hours}h · {booking.booking_meetings.length} encontro(s)
                </td>
                <td className="px-4 py-4">
                  <strong className="block font-[550] text-ink">{booking.student?.full_name}</strong>
                  {booking.instructor?.full_name ?? '—'}
                </td>
                <td className="px-4 py-4">
                  {first ? `${formatDateShort(first.starts_at)} · ${formatTime(first.starts_at)}` : '—'}
                  <br />
                  {(booking.beach?.name ?? '—')}
                </td>
                <td className="tabular px-4 py-4">{formatMoney(booking.total_cents)}</td>
                <td className="px-4 py-4"><Badge tone={TONE[booking.status]}>{BOOKING_STATUS_LABELS[booking.status]}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
