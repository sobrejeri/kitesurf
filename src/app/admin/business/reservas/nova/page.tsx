import { BookingWizard } from '@/components/business/booking-wizard';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { externalById } from '@/lib/business/bookings';
import { parseScope } from '@/lib/business/rules';

export const metadata = { title: 'Nova reserva presencial' };

export default async function NewExternalBookingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const alter = Array.isArray(params.alterar) ? params.alterar[0] : params.alterar;
  const current = alter ? externalById(alter) : undefined;
  const initial = current && current.status === 'confirmed'
    ? { unitId: current.unitId, serviceId: current.serviceId, instructorId: current.instructorId, name: current.customer, bookingId: current.id, code: current.code }
    : undefined;
  return (
    <>
      <DemoBanner />
      <PageHead title={initial ? 'Alterar reserva' : 'Nova reserva presencial'} subtitle="Os horários seguem a agenda única do instrutor, igual às reservas digitais." />
      <BookingWizard defaultUnit={scope.unidade} initial={initial} />
    </>
  );
}
