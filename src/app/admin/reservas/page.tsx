import type { Metadata } from 'next';

import { AdminBookingsTable } from '@/components/admin-tables';
import { Card, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllBookings } from '@/lib/data';

export const metadata: Metadata = { title: 'Reservas' };

export default async function BookingsPage() {
  await requireRole(['admin'], '/admin/reservas');
  const bookings = await listAllBookings(200);
  return (
    <>
      <PageHeader eyebrow="Cada atendimento acompanhado" title="Reservas" lead="Da confirmação ao registro dos minutos realizados." />
      <Card className="!p-2">
        <AdminBookingsTable bookings={bookings} />
      </Card>
    </>
  );
}
