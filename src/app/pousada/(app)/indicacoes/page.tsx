import type { Metadata } from 'next';

import { PartnerFootnote, PartnerHeading } from '@/components/partner-info';
import { ButtonLink, Card, EmptyState } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getPartnerSummary } from '@/lib/data';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Minhas indicações' };

/** Aggregates only: a partner never sees who its guests are. */
export default async function ReferralsPage() {
  const viewer = await requireRole(['partner'], '/pousada/indicacoes');
  const summary = viewer.role === 'partner' ? await getPartnerSummary() : null;
  return (
    <>
      <PartnerHeading title="Minhas indicações" lead="Totais por situação, sem dados pessoais dos hóspedes." />
      {!summary || summary.bookings === 0 ? (
        <EmptyState action={<ButtonLink href="/pousada/divulgacao" size="sm">Ver meu link</ButtonLink>}>
          Nenhuma reserva atribuída a esta pousada ainda.
        </EmptyState>
      ) : (
        <Card>
          <dl className="tabular grid gap-3 text-[13px]">
            <div className="flex justify-between"><dt className="text-muted">Reservas indicadas</dt><dd className="font-[550]">{summary.bookings}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Comissão pendente</dt><dd className="font-[550]">{formatMoney(summary.pending_cents)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Comissão liberada</dt><dd className="font-[550] text-brand">{formatMoney(summary.released_cents)}</dd></div>
          </dl>
        </Card>
      )}
      <PartnerFootnote />
    </>
  );
}
