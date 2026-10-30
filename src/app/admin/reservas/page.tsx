import type { Metadata } from 'next';

import { BookingsTable } from '@/components/shared';
import { Card, PageHeader } from '@/components/ui';
import { BOOKING } from '@/data/demo';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Reservas' };

export default function BookingsPage() {
  return (
    <>
      <PageHeader eyebrow="Cada atendimento acompanhado" title="Reservas" lead="Da confirmação ao registro dos minutos realizados." />
      <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
        {['Todas', 'Agendadas', 'Em aula', 'Registradas'].map((filter, index) => (
          <span key={filter} className={`rounded-full border px-3.5 py-2 ${index === 0 ? 'border-brand bg-brand-soft font-[550] text-brand' : 'border-line-input bg-surface text-label'}`}>
            {filter}
          </span>
        ))}
      </div>
      <Card className="!p-2">
        <BookingsTable totalLabel={formatMoney(BOOKING.totalCents)} />
      </Card>
    </>
  );
}
