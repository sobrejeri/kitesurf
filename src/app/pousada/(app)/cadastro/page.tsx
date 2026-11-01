import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { registerPartner } from '@/app/actions/partner';
import { ActionForm } from '@/components/action-form';
import { PartnerFootnote, PartnerHeading } from '@/components/partner-info';
import { Card, Field, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getOwnPartner, listActiveBeaches } from '@/lib/data';

export const metadata: Metadata = { title: 'Cadastro da pousada' };

export default async function PartnerSignupPage(){
  const viewer=await requireRole(['partner'],'/pousada/cadastro');
  const [partner,beaches]=await Promise.all([getOwnPartner(viewer.id),listActiveBeaches()]);
  if(partner)redirect('/pousada/perfil');
  return <>
    <PartnerHeading title="Cadastrar pousada" lead="Comece pelo nome e pela praia. Depois, complete seu perfil e aguarde a aprovação."/>
    <Card className="max-w-xl">
      <ActionForm action={registerPartner} submitLabel="Cadastrar pousada" className="grid gap-4">
        <Field label="Nome da pousada">
          <input name="name" required minLength={2} maxLength={120} className={inputClass}/>
        </Field>
        <Field label="Praia de referência">
          <select name="beachId" defaultValue={beaches[0]?.id} required className={inputClass}>
            {beaches.map(beach=><option key={beach.id} value={beach.id}>{beach.name}</option>)}
          </select>
        </Field>
      </ActionForm>
    </Card>
    <PartnerFootnote/>
  </>;
}
