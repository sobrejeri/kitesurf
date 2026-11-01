import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { registerPartner } from '@/app/actions/partner';
import { ActionForm } from '@/components/action-form';
import { PartnerFootnote, PartnerHeading } from '@/components/partner-info';
import { Badge, Card, Field, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getOwnPartner, listActiveBeaches } from '@/lib/data';
import { formatBps } from '@/lib/format';

export const metadata: Metadata = { title: 'Cadastro da pousada' };

export default async function PartnerSignupPage() {
  const viewer = await requireRole(['partner'], '/pousada/cadastro');
  const [partner, beaches] = await Promise.all([getOwnPartner(viewer.id), listActiveBeaches()]);
  if(partner)redirect('/pousada/perfil');
  return (
    <>
      <PartnerHeading title="Cadastro da pousada" lead="Cadastre sua pousada e aguarde a aprovação da operação." />
      {partner ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[16px] font-semibold">{partner.name}</p>
            <Badge tone={partner.status === 'approved' ? 'success' : 'warning'}>{partner.status === 'approved' ? 'Aprovada' : 'Em análise'}</Badge>
          </div>
          <p className="mt-2 text-[12px] text-muted">{(partner.beach?.name ?? '—')} · código permanente: {partner.code}</p>
          <p className="mt-3 text-[12px] font-[550] text-brand">Comissão para novas reservas: {formatBps(partner.commission_bps)}.</p>
        </Card>
      ) : (
        <Card className="max-w-xl">
          <ActionForm action={registerPartner} submitLabel="Enviar para aprovação" className="grid gap-4">
            <Field label="Nome da pousada">
              <input name="name" required minLength={2} maxLength={120} className={inputClass} />
            </Field>
            <Field label="Praia">
              <select name="beachId" defaultValue={beaches[0]?.id} required className={inputClass}>
                {beaches.map((beach) => <option key={beach.id} value={beach.id}>{beach.name}</option>)}
              </select>
            </Field>
          </ActionForm>
        </Card>
      )}
      <PartnerFootnote />
    </>
  );
}
