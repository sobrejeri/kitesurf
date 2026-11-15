import { Panel, PanelLink } from '@/components/admin/kit';
import { AffiliateTabs, PaymentNotice } from '@/components/business/affiliate-kit';
import { DemoBanner, PageHead, Stat } from '@/components/business/kit';
import { EmptyState } from '@/components/ui';
import { AFFILIATE_REQUESTS, COMPANY_AFFILIATES } from '@/lib/business/demo';
import { affiliateOf, salesInScope, totalsFor } from '@/lib/business/affiliates';
import { parseScope, scopeQuery, unitsInScope } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Afiliados da empresa' };

export default async function AffiliatesHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams); const q = scopeQuery(scope);
  const sales = salesInScope(new Set(unitsInScope(scope).map((u) => u.id))); const t = totalsFor(sales);
  const pending = AFFILIATE_REQUESTS.filter((r) => r.status === 'pending');
  const ranking = COMPANY_AFFILIATES.map((a) => ({ a, t: totalsFor(sales.filter((s) => s.affiliateId === a.id)) })).filter((x) => x.t.sales > 0).sort((x, y) => y.t.baseCents - x.t.baseCents);
  return (
    <>
      <DemoBanner />
      <PageHead title="Afiliados da empresa" subtitle="Quem divulga a escola, o que vendeu e quanto de comissão está em aberto." />
      <AffiliateTabs active="/admin/business/afiliados" query={q} />
      <PaymentNotice />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Afiliados ativos" value={String(COMPANY_AFFILIATES.filter((a) => a.status === 'active').length)} hint={`${COMPANY_AFFILIATES.length} vinculados no total`} />
        <Stat label="Solicitações pendentes" value={String(pending.length)} hint={pending.length ? 'Aguardando decisão' : 'Nada a decidir'} />
        <Stat label="Vendas atribuídas" value={formatMoney(t.baseCents)} hint={`${t.sales} venda(s) · ${t.reversedCount} cancelada(s) ou estornada(s)`} />
        <Stat label="Comissões a pagar" value={formatMoney(t.dueCents)} hint={`${formatMoney(t.expectedCents)} previstas · nada pago`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Quem mais vendeu" action={<PanelLink href={`/admin/business/afiliados/relatorios${q}`} label="Vendas" />}>
          {ranking.length === 0 ? <EmptyState>Sem vendas atribuídas neste filtro.</EmptyState> : <ul className="divide-y divide-line text-[13px]">{ranking.map(({ a, t: x }) => <li key={a.id} className="flex justify-between gap-3 py-2.5"><span className="text-ink">{a.name} <span className="text-muted">· {x.sales} venda(s)</span></span><span className="tabular font-semibold text-ink">{formatMoney(x.baseCents)}</span></li>)}</ul>}
        </Panel>
        <Panel title="Solicitações pendentes" action={<PanelLink href="/admin/business/afiliados/solicitacoes" label="Decidir" />}>
          {pending.length === 0 ? <EmptyState>Nenhuma solicitação pendente.</EmptyState> : <ul className="divide-y divide-line text-[13px]">{pending.map((r) => <li key={r.id} className="py-2.5"><strong className="text-ink">{r.name}</strong> <span className="text-muted">· {r.city}</span></li>)}</ul>}
        </Panel>
      </div>
      <p className="mt-3 text-[12px] text-muted">{affiliateOf('a-4')?.name} está suspenso: não ganha comissão em vendas novas.</p>
    </>
  );
}
