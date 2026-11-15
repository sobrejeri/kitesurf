import { notFound } from 'next/navigation';

import { ConfirmDialog } from '@/components/business/confirm-dialog';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { Panel } from '@/components/admin/kit';
import { Badge, ButtonLink, Note } from '@/components/ui';
import { STATUS_LABEL, bookingEnd, externalById } from '@/lib/business/bookings';
import { dayLabel, instructorName, unitName } from '@/lib/business/rules';
import { serviceOf } from '@/lib/business/services';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Detalhes da reserva' };

export default async function ExternalBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = externalById(id);
  if (!b) notFound();
  const open = b.status === 'confirmed';
  return (
    <>
      <DemoBanner />
      <PageHead title={`Reserva ${b.code}`} subtitle={`${serviceOf(b.serviceId)?.name} · ${unitName(b.unitId)}`}
        action={<Badge tone={b.status === 'cancelled' ? 'quiet' : b.status === 'done' ? 'success' : 'brand'}>{STATUS_LABEL[b.status]}</Badge>} />
      <Panel title="Dados da reserva">
        <dl className="grid gap-x-8 gap-y-2.5 text-[13px] sm:grid-cols-2">
          {([
            ['Cliente', b.customer], ['Quando', `${dayLabel(b.dayOffset)}, ${b.start}–${bookingEnd(b)}`], ['Instrutor', instructorName(b.instructorId)],
            ['Unidade', unitName(b.unitId)], ['Valor', formatMoney(b.priceCents)], ['Origem', 'Reserva presencial · sem taxa da plataforma'],
          ] as const).map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>)}
        </dl>
        <div className="mt-5 flex flex-wrap items-start gap-2">
          <ButtonLink href={`/admin/business/reservas/${b.id}/comprovante`} variant="ghost" size="sm" icon="file">Comprovante</ButtonLink>
          {open ? <ButtonLink href={`/admin/business/reservas/nova?alterar=${b.id}`} variant="ghost" size="sm" icon="calendar">Alterar data e horário</ButtonLink> : null}
          {open ? <ConfirmDialog danger trigger="Cancelar reserva" title={`Cancelar ${b.code}?`} description="O horário volta a ficar livre na agenda do instrutor. O cliente deve ser avisado."
            confirmLabel="Cancelar reserva" reasonLabel="Motivo do cancelamento" doneMessage="Cancelamento validado. Gravação desativada na demonstração." /> : null}
        </div>
      </Panel>
      {!open ? <Note className="mt-4">Reservas {b.status === 'done' ? 'realizadas' : 'canceladas'} não podem ser alteradas.</Note> : null}
    </>
  );
}
