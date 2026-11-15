import Link from 'next/link';

import { DemoBanner, PageHead, Stat } from '@/components/business/kit';
import { Badge, ButtonLink, EmptyState } from '@/components/ui';
import { CASH_SESSIONS } from '@/lib/business/demo';
import { expectedCashCents, movementsOf, sessionTotals } from '@/lib/business/caixa';
import { parseScope, scopeQuery, unitsInScope } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Caixa' };

export default async function CashDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = parseScope(await searchParams);
  const q = scopeQuery(scope);
  const units = unitsInScope(scope).filter((u) => u.active);
  const open = CASH_SESSIONS.filter((s) => !s.closing && units.some((u) => u.id === s.unitId));
  const sold = open.reduce((t, s) => t + sessionTotals(movementsOf(s.id)).salesTotalCents, 0);
  const cash = open.reduce((t, s) => t + expectedCashCents(s.openingCents, sessionTotals(movementsOf(s.id))), 0);
  return (
    <>
      <DemoBanner />
      <PageHead title="Caixa" subtitle="Situação do caixa de cada unidade." action={<ButtonLink href={`/admin/business/caixa/abrir${q}`} size="sm" icon="plus">Abrir caixa</ButtonLink>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Caixas abertos" value={String(open.length)} hint={`${units.length} unidade(s) ativa(s)`} />
        <Stat label="Vendido nos caixas abertos" value={formatMoney(sold)} hint="Dinheiro, Pix e cartão" />
        <Stat label="Dinheiro esperado" value={formatMoney(cash)} hint="Só dinheiro físico" />
        <Stat label="Para fechar" value={String(open.length)} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {units.length === 0 ? <EmptyState>Nenhuma unidade ativa neste filtro.</EmptyState> : units.map((u) => {
          const s = CASH_SESSIONS.find((x) => x.unitId === u.id && !x.closing);
          const t = s ? sessionTotals(movementsOf(s.id)) : null;
          return (
            <section key={u.id} className="rounded-[16px] border border-line bg-surface p-4 shadow-card" aria-label={u.name}>
              <div className="flex items-center justify-between gap-2"><h2 className="text-[15px] font-semibold text-ink">{u.name}</h2><Badge tone={s ? 'brand' : 'quiet'}>{s ? 'Caixa aberto' : 'Sem caixa aberto'}</Badge></div>
              {s && t ? (<>
                <p className="mt-1 text-[12px] text-muted">Aberto por {s.operator} · troco {formatMoney(s.openingCents)}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]"><div><dt className="text-muted">Vendas</dt><dd className="tabular font-semibold">{formatMoney(t.salesTotalCents)}</dd></div><div><dt className="text-muted">Dinheiro esperado</dt><dd className="tabular font-semibold">{formatMoney(expectedCashCents(s.openingCents, t))}</dd></div></dl>
                <div className="mt-3 flex flex-wrap gap-2"><ButtonLink href={`/admin/business/caixa/movimentacoes/nova${q}`} variant="ghost" size="sm">Registrar</ButtonLink><ButtonLink href={`/admin/business/caixa/fechar?caixa=${s.id}`} size="sm">Conferir e fechar</ButtonLink></div>
              </>) : <p className="mt-2 text-[13px] text-muted">Abra o caixa para registrar vendas e movimentações. <Link href={`/admin/business/caixa/abrir?unidade=${u.id}`} className="font-semibold text-brand underline">Abrir agora</Link></p>}
            </section>);
        })}
      </div>
    </>
  );
}
