import { CloseCashForm } from '@/components/business/cash-forms';
import { DemoBanner, PageHead, Stat } from '@/components/business/kit';
import { ButtonLink, EmptyState } from '@/components/ui';
import { CASH_SESSIONS } from '@/lib/business/demo';
import { expectedCashCents, movementsOf, sessionTotals } from '@/lib/business/caixa';
import { dayLabel, unitName } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Conferir e fechar caixa' };

export default async function ClosePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const want = Array.isArray(params.caixa) ? params.caixa[0] : params.caixa;
  const open = CASH_SESSIONS.filter((s) => !s.closing);
  const session = open.find((s) => s.id === want) ?? open[0];
  if (!session) return (<><DemoBanner /><PageHead title="Conferir e fechar caixa" /><EmptyState action={<ButtonLink href="/admin/business/caixa/abrir" size="sm">Abrir caixa</ButtonLink>}>Não há caixa aberto para fechar.</EmptyState></>);
  const t = sessionTotals(movementsOf(session.id));
  const expected = expectedCashCents(session.openingCents, t);
  return (
    <>
      <DemoBanner />
      <PageHead title="Conferir e fechar caixa" subtitle={`${unitName(session.unitId)} · ${dayLabel(session.dayOffset)} · aberto por ${session.operator}`} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Troco inicial" value={formatMoney(session.openingCents)} /><Stat label="Vendas em dinheiro" value={formatMoney(t.salesCashCents)} hint={`Pix ${formatMoney(t.salesPixCents)} · cartão ${formatMoney(t.salesCardCents)}`} />
        <Stat label="Suprimentos" value={formatMoney(t.suppliesCents)} /><Stat label="Sangrias e despesas" value={formatMoney(t.bleedsCents + t.expensesCents)} />
      </div>
      <CloseCashForm key={session.id} expectedCents={expected} />
    </>
  );
}
