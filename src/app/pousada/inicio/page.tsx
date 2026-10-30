import type { Metadata } from 'next';

import { PartnerFootnote, PartnerHeading } from '@/components/partner-info';
import { Badge, ButtonLink, Card, StatCard } from '@/components/ui';
import { PARTNER } from '@/data/demo';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Área da pousada' };

export default function PartnerHomePage() {
  return (
    <>
      <PartnerHeading title="Área da pousada" lead="Indique aulas e acompanhe suas comissões." />
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[16px] font-semibold">{PARTNER.name}</p>
          <p className="text-[12px] text-muted">{PARTNER.beach} · código {PARTNER.code}</p>
        </div>
        <Badge>Aprovada</Badge>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="Liberado" value={formatMoney(0)} hint="Horas realizadas, prontas para registro" icon="check" />
        <StatCard label="Pendente" value={formatMoney(0)} hint="Depende da realização das aulas" icon="clock" />
        <StatCard label="Repasses" value={formatMoney(0)} hint="Registros de teste" icon="wallet" />
        <StatCard label="Contratações" value="0" hint="0 encontro(s) indicado(s)" icon="users" />
      </div>
      <Card tone="tinted" className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[16px]">Seu link e QR Code</h2>
          <p className="mt-1 text-[12px] text-muted">{PARTNER.commissionLabel} sobre as aulas, sem incluir transporte.</p>
        </div>
        <ButtonLink href="/pousada/divulgacao" trailingIcon="arrow">Abrir divulgação</ButtonLink>
      </Card>
      <PartnerFootnote />
    </>
  );
}
