import Link from 'next/link';

import { Panel } from '@/components/admin/kit';
import { FinanceTabs, SettleBadge } from '@/components/business/finance-kit';
import { DataTable, DemoBanner, PageHead } from '@/components/business/kit';
import { Note } from '@/components/ui';
import { COMMISSION_ITEMS, EXTERNAL_PAYMENTS, INSTRUCTORS } from '@/lib/business/demo';
import { commissionCents, instructorBalance, instructorsWithLessons, schoolShareCents } from '@/lib/business/finance';
import { dayLabel, parseScope, scopeQuery, unitName } from '@/lib/business/rules';
import { formatBps, formatMoney } from '@/lib/format';

export const metadata = { title: 'Comissões de instrutores' };

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = parseScope(params); const q = scopeQuery(scope);
  const pick = Array.isArray(params.instrutor) ? params.instrutor[0] : params.instrutor;
  const rows = instructorsWithLessons(scope).map((id) => ({ id, name: INSTRUCTORS.find((i) => i.id === id)?.name ?? 'Instrutor', b: instructorBalance(id) }));
  const chosen = rows.find((r) => r.id === pick);
  const items = chosen ? COMMISSION_ITEMS.filter((c) => c.instructorId === chosen.id).sort((a, b) => b.dayOffset - a.dayOffset) : [];
  return (
    <>
      <DemoBanner />
      <PageHead title="Comissões de instrutores" subtitle="O que a escola deve a cada instrutor. O pagamento é feito pela escola, fora do VentoKite." />
      <FinanceTabs active="/admin/business/financeiro/comissoes" query={q} />
      <DataTable rows={rows} page={1} pageSize={10} hrefForPage={() => '/admin/business/financeiro/comissoes'} empty="Nenhum instrutor com aulas neste filtro."
        columns={[
          { key: 'n', header: 'Instrutor', cell: (r) => <Link href={`/admin/business/financeiro/comissoes?instrutor=${r.id}${q ? `&${q.slice(1)}` : ''}`} className="font-semibold text-brand hover:underline">{r.name}</Link> },
          { key: 'd', header: 'Devido', cell: (r) => formatMoney(r.b.dueCents), className: 'tabular' }, { key: 'p', header: 'Pago', cell: (r) => formatMoney(r.b.paidCents), className: 'tabular' },
          { key: 's', header: 'Saldo', cell: (r) => formatMoney(Math.max(0, r.b.balanceCents)), className: 'tabular' },
          { key: 'c', header: 'Aguardando confirmação', cell: (r) => formatMoney(r.b.unconfirmedCents), className: 'tabular' }, { key: 't', header: 'Situação', cell: (r) => <SettleBadge status={r.b.status} /> },
        ]} />
      {chosen ? (
        <Panel title={`Aulas de ${chosen.name}`} className="mt-4">
          <ul className="divide-y divide-line text-[13px]">{items.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="min-w-0"><strong className="text-ink">{c.lesson}</strong> <span className="text-muted">· {dayLabel(c.dayOffset)} · {unitName(c.unitId)}</span></span>
              <span className="tabular text-muted">Base {formatMoney(c.baseCents)} · {formatBps(c.commissionBps)} · escola fica com {formatMoney(schoolShareCents(c.baseCents, c.commissionBps))}</span>
              <strong className="tabular text-ink">{formatMoney(commissionCents(c.baseCents, c.commissionBps))}</strong>
            </li>))}</ul>
          <p className="mt-3 text-[12px] text-muted">Pagamentos registrados: {EXTERNAL_PAYMENTS.filter((p) => p.instructorId === chosen.id).map((p) => `${formatMoney(p.cents)} (${dayLabel(p.dayOffset)})`).join(', ') || 'nenhum'}.</p>
        </Panel>) : null}
      <Note className="mt-4" title="Sem repasse automático">O percentual fica congelado em cada aula: mudar a comissão de um instrutor não altera aulas já dadas. O VentoKite nunca transfere dinheiro da escola para o instrutor.</Note>
    </>
  );
}
