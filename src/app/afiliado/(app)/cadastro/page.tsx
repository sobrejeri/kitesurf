import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { registerPartner } from '@/app/actions/partner';
import { ActionForm } from '@/components/action-form';
import { AffiliateProgramRules } from '@/components/affiliate/program-rules';
import { AdminTitle } from '@/components/admin/kit';
import { Card, Field, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getOwnPartner, listActiveBeaches } from '@/lib/data';

export const metadata: Metadata = { title: 'Cadastro de afiliado' };

export default async function AffiliateSignupPage(){
  const viewer=await requireRole(['partner'],'/afiliado/cadastro');
  const [partner,beaches]=await Promise.all([getOwnPartner(viewer.id),listActiveBeaches()]);
  if(partner)redirect('/afiliado/perfil');
  return <>
    <AdminTitle title="Criar seu cadastro de afiliado"
      subtitle="Comece pelo nome e pela praia onde você atua. Depois, complete o perfil para a aprovação."/>
    <Card className="max-w-xl">
      <ActionForm action={registerPartner} submitLabel="Criar cadastro" className="grid gap-4">
        <Field label="Seu nome ou o da sua empresa" hint="Pode ser você, sua pousada, escola, loja ou perfil nas redes.">
          <input name="name" required minLength={2} maxLength={120} className={inputClass}/>
        </Field>
        <Field label="Praia onde você atua">
          <select name="beachId" defaultValue={beaches[0]?.id} required className={inputClass}>
            {beaches.map(beach=><option key={beach.id} value={beach.id}>{beach.name}</option>)}
          </select>
        </Field>
      </ActionForm>
    </Card>
    <AffiliateProgramRules className="mt-4 max-w-xl"/>
  </>;
}
