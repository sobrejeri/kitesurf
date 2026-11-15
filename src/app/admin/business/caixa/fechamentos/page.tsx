import Link from 'next/link';

import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { Badge } from '@/components/ui';
import { CASH_SESSIONS } from '@/lib/business/demo';
import { closingSummary } from '@/lib/business/caixa';
import { dayLabel, parseScope, scopeQuery, unitName, unitsInScope } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Histórico de fechamentos' };

export default async function ClosingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params);
  const page = Number(Array.isArray(params.pagina) ? params.pagina[0] : params.pagina) || 1;
  const keep: Record<string, string> = Object.fromEntries(new URLSearchParams(scopeQuery(scope).slice(1)));
  const ids = new Set(unitsInScope(scope).map((u) => u.id));
  const rows = CASH_SESSIONS.filter((s) => s.closing && ids.has(s.unitId)).flatMap((s) => { const c = closingSummary(s); return c ? [{ id: s.id, c }] : []; });
  return (
    <>
      <DemoBanner />
      <PageHead title="Histórico de fechamentos" subtitle="Cada fechamento guarda um Excel e um PDF, que podem ser baixados de novo." />
      <DataTable rows={rows} page={page} pageSize={6} hrefForPage={(p) => pageHref('/admin/business/caixa/fechamentos', keep, p)} empty="Nenhum fechamento neste filtro."
        columns={[
          { key: 'd', header: 'Fechamento', cell: (r) => <Link href={`/admin/business/caixa/fechamentos/${r.id}`} className="font-semibold text-brand hover:underline">{dayLabel(r.c.session.dayOffset)} · {unitName(r.c.session.unitId)}</Link> },
          { key: 'o', header: 'Operador', cell: (r) => r.c.session.operator },
          { key: 'e', header: 'Esperado', cell: (r) => formatMoney(r.c.expectedCents), className: 'tabular' },
          { key: 'c', header: 'Contado', cell: (r) => formatMoney(r.c.countedCents), className: 'tabular' },
          { key: 'x', header: 'Situação', cell: (r) => <Badge tone={r.c.rec.status === 'ok' ? 'success' : r.c.rec.status === 'surplus' ? 'warning' : 'danger'}>{r.c.rec.status === 'ok' ? 'Sem diferença' : `${r.c.rec.status === 'surplus' ? 'Sobra' : 'Falta'} ${formatMoney(Math.abs(r.c.rec.differenceCents))}`}</Badge> },
          { key: 'a', header: 'Arquivos', cell: (r) => <span className="flex gap-3"><a href={`/admin/business/caixa/fechamentos/${r.id}/arquivo?formato=xlsx`} className="font-semibold text-brand underline">Excel</a><a href={`/admin/business/caixa/fechamentos/${r.id}/arquivo?formato=pdf`} className="font-semibold text-brand underline">PDF</a></span> },
        ]} />
    </>
  );
}
