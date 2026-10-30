import type { Metadata } from 'next';

import { Badge, Button, Card, Note, PageHeader, StatCard } from '@/components/ui';
import { BOOKING } from '@/data/demo';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Financeiro' };

export default function AdminFinancePage() {
  return (
    <>
      <PageHeader title="Pagamentos e repasses" action={<Button variant="ghost" size="sm" icon="download">Exportar</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="Volume confirmado" value={formatMoney(BOOKING.totalCents)} hint="Pagamentos de demonstração" icon="wallet" />
        <StatCard label="Parcela plataforma" value={formatMoney(BOOKING.platformCents)} hint="Após comissão das pousadas; antes das taxas" icon="chart" />
        <StatCard label="Líquido dos instrutores" value={formatMoney(BOOKING.instructorNetCents)} hint="Antes da regra final de taxas" icon="users" />
        <StatCard label="Repasses registrados" value={formatMoney(BOOKING.payoutCents)} hint="Controle manual de teste" icon="check" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center justify-between">
          <span><strong className="block text-[13px] font-[550]">Comissões de pousadas</strong><span className="text-[11px] text-muted">0 encontro(s)</span></span>
          <span className="tabular font-semibold text-brand">{formatMoney(BOOKING.partnerCents)}</span>
        </Card>
        <Card className="flex items-center justify-between">
          <strong className="text-[13px] font-[550]">Saldos e reembolsos</strong>
          <Button variant="ghost" size="sm">Ver detalhes</Button>
        </Card>
      </div>
      <Card className="mt-5 !p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <div>
            <h2 className="text-[16px]">Distribuição por reserva</h2>
            <p className="text-[11px] text-muted">A comissão é definida no momento da solicitação.</p>
          </div>
          <Badge tone="quiet">Sem cobrança real</Badge>
        </div>
        <div className="relative mt-4 overflow-x-auto">
          <table className="tabular w-full min-w-[820px] text-left">
            <thead>
              <tr className="bg-[#fafbfe] text-[10px] uppercase tracking-[.5px] text-quiet">
                {['Reserva', 'Instrutor', 'Aula', 'Transporte', 'Pousada', 'Plataforma', 'Instrutor', 'Repasse'].map((head, index) => (
                  <th key={`${head}-${index}`} className="px-4 py-3 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[12px] text-[#596b87]">
              <tr className="border-t border-[#eef1f6]">
                <td className="px-4 py-4 font-[550] text-brand">{BOOKING.code}</td>
                <td className="px-4 py-4">Rafael Lima</td>
                <td className="px-4 py-4">{formatMoney(BOOKING.totalCents)}</td>
                <td className="px-4 py-4">{formatMoney(BOOKING.transportCents)}</td>
                <td className="px-4 py-4">{formatMoney(BOOKING.partnerCents)}</td>
                <td className="px-4 py-4">{formatMoney(BOOKING.platformCents)}</td>
                <td className="px-4 py-4">{formatMoney(BOOKING.instructorNetCents)}</td>
                <td className="px-4 py-4"><Button variant="soft" size="sm">Registrar teste</Button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Note tone="warning" className="mt-5">
        Ainda precisamos definir as taxas do provedor, as condições de reembolso e quando o instrutor recebe. O esboço demonstra a divisão, sem movimentar dinheiro.
      </Note>
    </>
  );
}
