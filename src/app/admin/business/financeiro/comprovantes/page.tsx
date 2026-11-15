import Link from 'next/link';

import { FinanceTabs } from '@/components/business/finance-kit';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { Badge } from '@/components/ui';
import { EXTERNAL_PAYMENTS, INSTRUCTORS } from '@/lib/business/demo';
import { METHOD_NAME } from '@/lib/business/finance';
import { dayLabel, parseScope, scopeQuery } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Histórico de comprovantes' };

export default async function ReceiptsHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams);
  return (
    <>
      <DemoBanner />
      <PageHead title="Histórico de comprovantes" subtitle="Comprovantes dos pagamentos aos instrutores, registrados pela escola." />
      <FinanceTabs active="/admin/business/financeiro/comprovantes" query={scopeQuery(scope)} />
      <DataTable rows={[...EXTERNAL_PAYMENTS].sort((a, b) => b.dayOffset - a.dayOffset)} page={1} pageSize={10} hrefForPage={() => '#'} empty="Nenhum comprovante registrado."
        columns={[
          { key: 'r', header: 'Referência', cell: (p) => <Link href={`/admin/business/financeiro/comprovantes/${p.id}`} className="font-mono font-semibold text-brand hover:underline">{p.reference}</Link> },
          { key: 'd', header: 'Data', cell: (p) => dayLabel(p.dayOffset), className: 'tabular' }, { key: 'i', header: 'Instrutor', cell: (p) => INSTRUCTORS.find((i) => i.id === p.instructorId)?.name },
          { key: 'v', header: 'Valor', cell: (p) => formatMoney(p.cents), className: 'tabular' }, { key: 'm', header: 'Forma', cell: (p) => METHOD_NAME[p.method] },
          { key: 'c', header: 'Confirmação', cell: (p) => <Badge tone={p.confirmed ? 'success' : 'warning'}>{p.confirmed ? 'Confirmado' : 'Aguardando'}</Badge> },
        ]} />
    </>
  );
}
