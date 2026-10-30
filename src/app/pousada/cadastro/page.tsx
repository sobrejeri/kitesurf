import type { Metadata } from 'next';

import { DemoForm } from '@/components/interactive';
import { PartnerFootnote, PartnerHeading } from '@/components/partner-info';
import { Badge, Button, Card, Field, inputClass } from '@/components/ui';
import { BEACHES, PARTNER } from '@/data/demo';

export const metadata: Metadata = { title: 'Cadastro de pousadas' };

export default function PartnerSignupPage() {
  return (
    <>
      <PartnerHeading title="Cadastro de pousadas" lead="Cadastre sua indicação e aguarde aprovação da operação." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[16px] font-semibold">{PARTNER.name}</p>
            <Badge>Aprovada</Badge>
          </div>
          <p className="mt-2 text-[12px] text-muted">{PARTNER.contact}</p>
          <p className="text-[12px] text-muted">{PARTNER.beach} · código permanente: {PARTNER.code}</p>
          <p className="mt-3 text-[12px] font-[550] text-brand">Comissão para novas solicitações: {PARTNER.commissionLabel}.</p>
        </Card>
        <Card>
          <h2 className="text-[16px]">Cadastrar outra pousada de teste</h2>
          <DemoForm confirmation="Pousada de teste enviada para aprovação. Ela aparece em Admin › Pousadas afiliadas." className="mt-4 grid gap-4">
            <Field label="Nome da pousada"><input className={inputClass} required /></Field>
            <Field label="E-mail de contato"><input className={inputClass} type="email" placeholder="recepcao@exemplo.com" /></Field>
            <Field label="Praia">
              <select className={inputClass} defaultValue="Preá">
                {Object.values(BEACHES).map((beach) => <option key={beach}>{beach}</option>)}
              </select>
            </Field>
            <Button type="submit" className="justify-self-start">Enviar para aprovação</Button>
          </DemoForm>
        </Card>
      </div>
      <PartnerFootnote />
    </>
  );
}
