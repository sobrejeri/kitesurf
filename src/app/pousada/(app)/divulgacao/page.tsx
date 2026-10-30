import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CopyField } from '@/components/interactive';
import { PartnerFootnote, PartnerHeading } from '@/components/partner-info';
import { Card, Note } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getOwnPartner } from '@/lib/data';
import { SITE_URL } from '@/lib/env';
import { formatBps } from '@/lib/format';

export const metadata: Metadata = { title: 'Divulgação' };

export default async function PromotePage() {
  const viewer = await requireRole(['partner'], '/pousada/divulgacao');
  const partner = await getOwnPartner(viewer.id);
  if (!partner) redirect('/pousada/cadastro');
  const link = `${SITE_URL}/aluno/inicio?ref=${partner.code}`;
  return (
    <>
      <PartnerHeading title="Divulgue as aulas" lead="Ofereça aos hóspedes uma experiência no mar." />
      <Card>
        <p className="text-[16px] font-semibold">{partner.name}</p>
        <p className="text-[12px] text-muted">{formatBps(partner.commission_bps)} sobre as horas de aula · código {partner.code}</p>
        {partner.status === 'approved' ? (
          <>
            <h2 className="mt-6 text-[14px]">Seu link de indicação</h2>
            <div className="mt-3"><CopyField value={link} /></div>
            <p className="mt-3 text-[11px] text-muted">Quem reserva em até 30 dias depois de abrir o link fica vinculado à sua pousada.</p>
          </>
        ) : (
          <Note tone="warning" className="mt-5">O link é liberado depois que a operação aprovar a pousada.</Note>
        )}
      </Card>
      <PartnerFootnote />
    </>
  );
}
