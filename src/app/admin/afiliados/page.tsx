import type { Metadata } from 'next';

import { approvePartner } from '@/app/actions/admin';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, EmptyState, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { BEACH_LABELS, listAllPartners } from '@/lib/data';
import { formatBps } from '@/lib/format';

export const metadata: Metadata = { title: 'Pousadas afiliadas' };

export default async function PartnersAdminPage() {
  await requireRole(['admin'], '/admin/afiliados');
  const partners = await listAllPartners();
  return (
    <>
      <PageHeader title="Pousadas afiliadas" lead="Aprovação, comissões e acompanhamento das indicações." />
      {partners.length === 0 ? (
        <EmptyState>Nenhuma pousada cadastrada. Pousadas criam conta em /cadastro escolhendo “Sou pousada”.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {partners.map((partner) => (
            <Card key={partner.id} className="!p-4 sm:!p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-[550]">{partner.name}</p>
                  <p className="text-[11px] text-muted">{partner.code} · {BEACH_LABELS[partner.beach]} · {formatBps(partner.commission_bps)}</p>
                </div>
                <Badge tone={partner.status === 'approved' ? 'success' : 'warning'}>{partner.status === 'approved' ? 'Aprovada' : 'Em análise'}</Badge>
              </div>
              {partner.status === 'pending' ? (
                <div className="mt-4 border-t border-line pt-4">
                  <ActionForm action={approvePartner} submitLabel="Aprovar pousada" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="partnerId" value={partner.id} />
                    <input name="reason" required minLength={3} placeholder="Motivo (fica no histórico)" aria-label="Motivo" className={`${inputClass} !h-9 max-w-56`} />
                  </ActionForm>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
      <Note className="mt-5" title="Como a indicação gera comissão">
        A pousada recebe um percentual do total das aulas reservadas pelo link dela, pago da comissão da plataforma. O preço do aluno e o líquido do instrutor não mudam.
      </Note>
    </>
  );
}
