import type { Metadata } from 'next';

import { Icon } from '@/components/icon';
import { CopyField } from '@/components/interactive';
import { PartnerFootnote, PartnerHeading } from '@/components/partner-info';
import { ButtonLink, Card } from '@/components/ui';
import { PARTNER } from '@/data/demo';

export const metadata: Metadata = { title: 'Divulgação' };

export default function PromotePage() {
  const link = `/aluno/inicio?ref=${PARTNER.code}`;
  return (
    <>
      <PartnerHeading title="Divulgue as aulas" lead="Ofereça aos hóspedes uma experiência no mar." />
      <Card>
        <p className="text-[16px] font-semibold">{PARTNER.name}</p>
        <p className="text-[12px] text-muted">{PARTNER.commissionLabel} sobre as horas de aula realizadas · código {PARTNER.code}</p>
        <h2 className="mt-6 text-[14px]">Seu link de indicação</h2>
        <div className="mt-3">
          <CopyField value={`https://vento.exemplo${link}`} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex min-h-[45px] items-center gap-2 rounded-full border border-line-ghost bg-surface px-5 text-[13px] font-[550] text-brand">
            <Icon name="download" className="!h-[18px] !w-[18px]" /> Baixar QR Code
          </span>
          <ButtonLink href={link} variant="soft">Testar minha indicação</ButtonLink>
        </div>
      </Card>
      <PartnerFootnote />
    </>
  );
}
