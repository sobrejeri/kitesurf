import { FinanceTabs } from '@/components/business/finance-kit';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { ExternalPaymentForm } from '@/components/business/payment-form';
import { Badge } from '@/components/ui';
import { EXTERNAL_PAYMENTS, INSTRUCTORS } from '@/lib/business/demo';
import { METHOD_NAME } from '@/lib/business/finance';
import { dayLabel, parseScope, scopeQuery } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Pagamentos externos' };

export default async function ExternalPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams);
  return (
    <>
      <DemoBanner />
      <PageHead title="Pagamentos externos" subtitle="Pagamentos que a escola fez aos instrutores por conta própria. O VentoKite só registra." />
      <FinanceTabs active="/admin/business/financeiro/pagamentos" query={scopeQuery(scope)} />
      <ExternalPaymentForm />
      <h2 className="mb-2 mt-6 text-[15px] font-semibold text-ink">Registrados</h2>
      <DataTable rows={[...EXTERNAL_PAYMENTS].sort((a, b) => b.dayOffset - a.dayOffset)} page={1} pageSize={10} hrefForPage={() => '/admin/business/financeiro/pagamentos'} empty="Nenhum pagamento registrado."
        columns={[
          { key: 'd', header: 'Data', cell: (p) => dayLabel(p.dayOffset), className: 'tabular' }, { key: 'i', header: 'Instrutor', cell: (p) => <span className="font-semibold">{INSTRUCTORS.find((i) => i.id === p.instructorId)?.name}</span> },
          { key: 'm', header: 'Forma', cell: (p) => METHOD_NAME[p.method] }, { key: 'r', header: 'Referência', cell: (p) => p.reference, className: 'font-mono' },
          { key: 'v', header: 'Valor', cell: (p) => formatMoney(p.cents), className: 'tabular' },
          { key: 'c', header: 'Instrutor confirmou?', cell: (p) => <Badge tone={p.confirmed ? 'success' : 'warning'}>{p.confirmed ? 'Confirmado' : 'Aguardando confirmação'}</Badge> },
        ]} />
    </>
  );
}
