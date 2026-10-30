import type { Metadata } from 'next';

import { PartnerFootnote, PartnerHeading } from '@/components/partner-info';
import { ButtonLink, EmptyState } from '@/components/ui';

export const metadata: Metadata = { title: 'Minhas indicações' };

export default function ReferralsPage() {
  return (
    <>
      <PartnerHeading title="Minhas indicações" lead="Valores por encontro, sem dados pessoais dos hóspedes." />
      <EmptyState action={<ButtonLink href="/pousada/divulgacao" size="sm">Ver meu link</ButtonLink>}>
        Nenhuma reserva atribuída a esta pousada. Use seu link para iniciar uma reserva de teste.
      </EmptyState>
      <PartnerFootnote />
    </>
  );
}
