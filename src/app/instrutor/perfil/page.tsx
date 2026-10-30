import type { Metadata } from 'next';

import { Avatar, Badge, ButtonLink, Card, Note, PageHeader } from '@/components/ui';
import { INSTRUCTORS, INSTRUCTOR } from '@/data/demo';

export const metadata: Metadata = { title: 'Meu perfil profissional' };

export default function InstructorProfilePage() {
  const me = INSTRUCTORS[0];
  return (
    <>
      <PageHeader title="Meu perfil profissional" />
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar initials={INSTRUCTOR.initials} size={64} />
          <div className="flex-1">
            <p className="text-[18px] font-semibold">{INSTRUCTOR.name}</p>
            <p className="text-[12px] text-muted">{INSTRUCTOR.role}</p>
          </div>
          <Badge>Perfil aprovado</Badge>
        </div>
        <details className="mt-5 border-t border-line pt-4 text-[12px]">
          <summary className="cursor-pointer font-[550] text-brand">Expandir dados profissionais</summary>
          <dl className="mt-3 grid gap-2 text-muted sm:grid-cols-2">
            <div><dt>Experiência</dt><dd className="text-ink">{me?.years} anos</dd></div>
            <div><dt>Praias</dt><dd className="text-ink">{me?.beaches}</dd></div>
            <div><dt>Idiomas</dt><dd className="text-ink">{me?.languages}</dd></div>
            <div><dt>Equipamentos</dt><dd className="text-ink">Kite, prancha, trapézio e colete</dd></div>
          </dl>
        </details>
        <ButtonLink href="/instrutor/perfil" variant="ghost" className="mt-5" trailingIcon="arrow">Ver perfil público</ButtonLink>
      </Card>
      <Note className="mt-5">
        Idiomas, praias, equipamentos e agenda são usados para selecionar solicitações compatíveis com você.
      </Note>
    </>
  );
}
