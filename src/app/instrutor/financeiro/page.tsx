import type { Metadata } from 'next';

import { Card, EmptyState, Note, PageHeader, StatCard } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { BOOKING_STATUS_LABELS, listBookingsForInstructor } from '@/lib/data';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Meu financeiro' };

/**
 * Every amount here is a booking's frozen snapshot, computed by the database
 * when the booking was created. The page only adds them up for display.
 */
export default async function InstructorFinancePage() {
  const viewer = await requireRole(['instructor'], '/instrutor/financeiro');
  const bookings = (await listBookingsForInstructor(viewer.id)).filter(
    (booking) => booking.status === 'confirmed' || booking.status === 'completed',
  );
  const gross = bookings.reduce((sum, b) => sum + b.total_cents, 0);
  const net = bookings.reduce((sum, b) => sum + b.instructor_net_cents, 0);
  const commission = gross - net;

  return (
    <>
      <PageHeader title="Meu financeiro" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="Líquido previsto" value={formatMoney(net)} hint="Após comissão da plataforma" icon="wallet" />
        <StatCard label="Repasse registrado" value={formatMoney(0)} hint="Repasses ainda não integrados" icon="check" />
        <StatCard label="Vendas brutas" value={formatMoney(gross)} hint="Pago pelos alunos" icon="chart" />
        <StatCard label="Reservas confirmadas" value={String(bookings.length)} hint="Vendas pelo aplicativo" icon="book" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <h2 className="text-[16px]">Entenda o valor das reservas</h2>
          <dl className="tabular mt-4 grid gap-3 text-[13px]">
            <div className="flex justify-between"><dt className="text-muted">Vendas brutas</dt><dd className="font-[550]">{formatMoney(gross)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Comissão da plataforma</dt><dd className="font-[550] text-danger">− {formatMoney(commission)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3"><dt className="font-[550]">Líquido previsto</dt><dd className="text-[17px] font-semibold text-brand">{formatMoney(net)}</dd></div>
          </dl>
          <Note className="mt-4">A comissão de cada reserva é fixada quando o aluno reserva. Repasses reais dependem da integração de pagamento.</Note>
        </Card>
        <Card className="!p-0">
          <h2 className="px-5 pt-5 text-[16px] sm:px-6">Extrato de reservas</h2>
          {bookings.length === 0 ? (
            <div className="p-5"><EmptyState>Nenhuma reserva confirmada ainda.</EmptyState></div>
          ) : (
            <div className="relative mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr className="bg-[#fafbfe] text-[10px] uppercase tracking-[.5px] text-quiet">
                    {['Reserva', 'Aluno', 'Bruto', 'Líquido', 'Situação'].map((head) => (
                      <th key={head} className="px-5 py-3 font-medium">{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular text-[12px] text-[#596b87]">
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-[#eef1f6]">
                      <td className="px-5 py-4 font-[550] text-brand">{booking.code}</td>
                      <td className="px-5 py-4">{booking.student?.full_name}</td>
                      <td className="px-5 py-4">{formatMoney(booking.total_cents)}</td>
                      <td className="px-5 py-4">{formatMoney(booking.instructor_net_cents)}</td>
                      <td className="px-5 py-4">{BOOKING_STATUS_LABELS[booking.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
