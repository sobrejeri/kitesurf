import type { Metadata } from 'next';

import { Badge, Card, EmptyState, Note, PageHeader, StatCard } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { BOOKING_STATUS_LABELS, listAllBookings } from '@/lib/data';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Financeiro' };

/** Sums of each booking's frozen split. Nothing is recomputed here. */
export default async function AdminFinancePage() {
  await requireRole(['admin'], '/admin/financeiro');
  const bookings = (await listAllBookings(500)).filter((b) => b.status === 'confirmed' || b.status === 'completed');
  const sum = (pick: (b: (typeof bookings)[number]) => number) => bookings.reduce((total, b) => total + pick(b), 0);
  return (
    <>
      <PageHeader title="Pagamentos e repasses" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="Volume confirmado" value={formatMoney(sum((b) => b.total_cents))} hint="Pagamentos de teste" icon="wallet" />
        <StatCard label="Parcela plataforma" value={formatMoney(sum((b) => b.platform_cents))} hint="Após comissão das pousadas" icon="chart" />
        <StatCard label="Líquido dos instrutores" value={formatMoney(sum((b) => b.instructor_net_cents))} hint="A repassar" icon="users" />
        <StatCard label="Comissões de pousadas" value={formatMoney(sum((b) => b.partner_cents))} hint="Sobre aulas indicadas" icon="home" />
      </div>
      <Card className="mt-5 !p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <div>
            <h2 className="text-[16px]">Distribuição por reserva</h2>
            <p className="text-[11px] text-muted">A divisão é fixada no momento da reserva.</p>
          </div>
          <Badge tone="quiet">Sem cobrança real</Badge>
        </div>
        {bookings.length === 0 ? (
          <div className="p-5"><EmptyState>Nenhuma reserva paga ainda.</EmptyState></div>
        ) : (
          <div className="relative mt-4 overflow-x-auto">
            <table className="tabular w-full min-w-[760px] text-left">
              <thead>
                <tr className="bg-[#fafbfe] text-[10px] uppercase tracking-[.5px] text-quiet">
                  {['Reserva', 'Instrutor', 'Total', 'Pousada', 'Plataforma', 'Instrutor (líquido)', 'Situação'].map((head) => (
                    <th key={head} className="px-4 py-3 font-medium">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-[12px] text-[#596b87]">
                {bookings.map((b) => (
                  <tr key={b.id} className="border-t border-[#eef1f6]">
                    <td className="px-4 py-4 font-[550] text-brand">{b.code}</td>
                    <td className="px-4 py-4">{b.instructor?.full_name}</td>
                    <td className="px-4 py-4">{formatMoney(b.total_cents)}</td>
                    <td className="px-4 py-4">{formatMoney(b.partner_cents)}</td>
                    <td className="px-4 py-4">{formatMoney(b.platform_cents)}</td>
                    <td className="px-4 py-4">{formatMoney(b.instructor_net_cents)}</td>
                    <td className="px-4 py-4">{BOOKING_STATUS_LABELS[b.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Note tone="warning" className="mt-5">Taxas do provedor, reembolsos e repasses ainda dependem da integração de pagamento. Nada aqui movimenta dinheiro.</Note>
    </>
  );
}
