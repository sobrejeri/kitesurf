import type { Metadata } from 'next';

import { Card, Button, Note, PageHeader, StatCard } from '@/components/ui';
import { BOOKING, NET_BY_DAY } from '@/data/demo';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Meu financeiro' };

export default function InstructorFinancePage() {
  const peak = Math.max(...NET_BY_DAY.map((day) => day.cents), 1);
  return (
    <>
      <PageHeader title="Meu financeiro" action={<Button variant="ghost" size="sm" icon="download">Exportar</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="Líquido previsto" value={formatMoney(BOOKING.instructorNetCents)} hint="Após comissão demonstrativa" icon="wallet" />
        <StatCard label="Repasse registrado" value={formatMoney(BOOKING.payoutCents)} hint="Controle de teste" icon="check" />
        <StatCard label="A acompanhar" value={formatMoney(BOOKING.instructorNetCents)} hint="Regra de repasse em validação" icon="clock" />
        <StatCard label="Reservas confirmadas" value="1" hint="Vendas pelo aplicativo" icon="book" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="text-[16px]">Reservas por data de aula</h2>
          <p className="mt-1 text-[12px] text-muted">Valores líquidos das reservas nos próximos sete dias.</p>
          <div className="mt-6 flex items-end gap-3" role="img" aria-label="Líquido previsto por dia: R$ 1.275 em 02/11, nenhum valor nos outros dias">
            {NET_BY_DAY.map((day) => (
              <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-32 w-full items-end">
                  <div
                    className={`w-full rounded-t-[6px] ${day.cents > 0 ? 'bg-brand-bar' : 'bg-[#edf0f7]'}`}
                    style={{ height: `${day.cents > 0 ? Math.round((day.cents / peak) * 100) : 4}%` }}
                  />
                </div>
                <span className="tabular text-[10px] text-muted">{day.label}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-[16px]">Entenda o valor de cada reserva</h2>
          <dl className="tabular mt-4 grid gap-3 text-[13px]">
            <div className="flex justify-between"><dt className="text-muted">Vendas brutas</dt><dd className="font-[550]">{formatMoney(BOOKING.totalCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Comissão da plataforma</dt><dd className="font-[550] text-danger">− {formatMoney(BOOKING.platformCents)}</dd></div>
            <div className="flex justify-between border-t border-line pt-3"><dt className="font-[550]">Líquido previsto</dt><dd className="text-[17px] font-semibold text-brand">{formatMoney(BOOKING.instructorNetCents)}</dd></div>
          </dl>
          <Note className="mt-4">Percentuais e valores são exemplos do protótipo. Taxas e repasses comerciais ainda serão definidos.</Note>
        </Card>
      </div>

      <Card className="mt-5 !p-0">
        <h2 className="px-5 pt-5 text-[16px] sm:px-6">Extrato de reservas</h2>
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="bg-[#fafbfe] text-[10px] uppercase tracking-[.5px] text-quiet">
                {['Reserva', 'Aluno', 'Bruto', 'Líquido', 'Repasse'].map((head) => (
                  <th key={head} className="px-5 py-3 font-medium sm:px-6">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular text-[12px] text-[#596b87]">
              <tr className="border-t border-[#eef1f6]">
                <td className="px-5 py-4 font-[550] text-brand sm:px-6">{BOOKING.code}</td>
                <td className="px-5 py-4 sm:px-6">Luana</td>
                <td className="px-5 py-4 sm:px-6">{formatMoney(BOOKING.totalCents)}</td>
                <td className="px-5 py-4 sm:px-6">{formatMoney(BOOKING.instructorNetCents)}</td>
                <td className="px-5 py-4 sm:px-6">A acompanhar</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
