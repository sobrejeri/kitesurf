import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PartnerFootnote, PartnerHeading } from '@/components/partner-info';
import { Badge, ButtonLink, Card, StatCard } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { BEACH_LABELS, getOwnPartner, getPartnerSummary } from '@/lib/data';
import { formatBps, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Área da pousada' };

export default async function PartnerHomePage() {
  const viewer = await requireRole(['partner'], '/pousada/inicio');
  const partner = await getOwnPartner(viewer.id);
  if (!partner) redirect('/pousada/cadastro');
  // An admin opening this area has no partner summary of their own.
  const summary = viewer.role === 'partner' ? await getPartnerSummary() : { bookings: 0, pending_cents: 0, released_cents: 0 };

  return (
    <>
      <PartnerHeading title="Área da pousada" lead="Indique aulas e acompanhe suas comissões." />
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[16px] font-semibold">{partner.name}</p>
          <p className="text-[12px] text-muted">{BEACH_LABELS[partner.beach]} · código {partner.code}</p>
        </div>
        <Badge tone={partner.status === 'approved' ? 'success' : 'warning'}>{partner.status === 'approved' ? 'Aprovada' : 'Em análise'}</Badge>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard highlight label="Liberado" value={formatMoney(summary.released_cents)} hint="Aulas realizadas" icon="check" />
        <StatCard label="Pendente" value={formatMoney(summary.pending_cents)} hint="Depende da realização das aulas" icon="clock" />
        <StatCard label="Contratações" value={String(summary.bookings)} hint="Reservas pelo seu link" icon="users" />
      </div>
      <Card tone="tinted" className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[16px]">Seu link de indicação</h2>
          <p className="mt-1 text-[12px] text-muted">{formatBps(partner.commission_bps)} sobre as aulas, sem incluir transporte.</p>
        </div>
        <ButtonLink href="/pousada/divulgacao" trailingIcon="arrow">Abrir divulgação</ButtonLink>
      </Card>
      <PartnerFootnote />
    </>
  );
}
