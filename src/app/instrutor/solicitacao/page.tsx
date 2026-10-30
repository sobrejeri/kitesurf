import type { Metadata } from 'next';

import { ButtonLink, Card, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Receber solicitação' };

export default function RequestPage() {
  return (
    <>
      <PageHeader title="Receber solicitação" />
      <Card className="py-12 text-center">
        <p className="text-[16px] font-semibold">Nenhuma solicitação pendente.</p>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-muted">
          Mantenha sua disponibilidade e sua agenda atualizadas para receber novas aulas.
        </p>
        <ButtonLink href="/instrutor/hoje" className="mt-6" trailingIcon="arrow">Ver meu dia</ButtonLink>
      </Card>
    </>
  );
}
