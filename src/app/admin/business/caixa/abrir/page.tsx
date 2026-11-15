import { OpenCashForm } from '@/components/business/cash-forms';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { parseScope } from '@/lib/business/rules';

export const metadata = { title: 'Abrir caixa' };
export default async function OpenCashPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams);
  return (<><DemoBanner /><PageHead title="Abrir caixa" subtitle="Informe o troco inicial. Cada unidade tem um caixa aberto por vez." /><OpenCashForm defaultUnit={scope.unidade} /></>);
}
