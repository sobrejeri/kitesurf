import type { Metadata } from 'next';

import { AdminTitle, BarChart, Metric, Panel } from '@/components/admin/kit';
import { BOOKING_STATUS } from '@/components/admin/labels';
import { Badge, EmptyState, Note } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listBookingsForInstructor } from '@/lib/data';
import { dayKey, lastDays } from '@/lib/dates';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Meu financeiro' };

/** Each booking's frozen snapshot, summed for display; nothing is recomputed. */
export default async function InstructorFinancePage() {
  const viewer = await requireRole(['instructor'], '/instrutor/financeiro');
  const bookings = (await listBookingsForInstructor(viewer.id)).filter(
    (booking) => !booking.is_test && (booking.status === 'confirmed' || booking.status === 'completed'),
  );
  const gross = bookings.reduce((sum, b) => sum + b.total_cents, 0);
  const net = bookings.reduce((sum, b) => sum + b.instructor_net_cents, 0);
  const perDay = lastDays(7).map((day) => ({
    label: day.label.slice(0, 5),
    value: bookings.filter((b) => dayKey(b.created_at) === day.key).reduce((sum, b) => sum + b.instructor_net_cents, 0),
  }));

  return (
    <>
      <AdminTitle title="Meu financeiro" subtitle="Valores das suas reservas confirmadas." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Líquido previsto" value={formatMoney(net)} hint="Após comissão" hintTone="success" icon="wallet" tone="green" />
        <Metric label="Vendas brutas" value={formatMoney(gross)} hint="Pago pelos alunos" icon="chart" tone="blue" />
        <Metric label="Comissão da plataforma" value={formatMoney(gross - net)} hint="Fixada em cada reserva" icon="sliders" tone="purple" />
        <Metric label="Reservas" value={String(bookings.length)} hint="Confirmadas" icon="book" tone="orange" />
      </div>

      <Panel title="Líquido por dia da reserva" action={<span className="text-[12px] text-muted">Últimos 7 dias</span>} className="mt-4">
        <BarChart points={perDay} describe={formatMoney} />
      </Panel>

      <Panel title="Extrato de reservas" className="mt-4">
        {bookings.length === 0 ? (
          <EmptyState>Nenhuma reserva confirmada ainda.</EmptyState>
        ) : (
          <ul className="grid gap-2">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3">
                <span className="min-w-0">
                  <strong className="block truncate text-[14px] font-semibold text-ink">
                    #{b.code.replace('VNT-', '')} · {b.student?.full_name ?? 'Aluno'}
                  </strong>
                  <span className="tabular text-[12px] text-muted">Bruto {formatMoney(b.total_cents)}</span>
                </span>
                <span className="text-right">
                  <strong className="tabular block text-[15px] font-bold text-brand">{formatMoney(b.instructor_net_cents)}</strong>
                  <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Note className="mt-4">Repasses reais dependem da integração de pagamento.</Note>
    </>
  );
}
