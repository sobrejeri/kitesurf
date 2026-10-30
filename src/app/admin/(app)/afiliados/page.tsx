import type { Metadata } from 'next';

import { approvePartner } from '@/app/actions/admin';
import { ActionForm } from '@/components/action-form';
import { AdminTitle } from '@/components/admin/kit';
import { Icon } from '@/components/icon';
import { Badge, EmptyState, Note, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllBookings, listAllPartners } from '@/lib/data';
import { formatBps, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Pousadas afiliadas' };

export default async function PartnersAdminPage() {
  await requireRole(['admin'], '/admin/afiliados');
  const [partners, bookings] = await Promise.all([listAllPartners(), listAllBookings(500)]);
  const stats = (partnerId: string) => {
    const theirs = bookings.filter((b) => b.partner_id === partnerId && b.status !== 'cancelled');
    return { count: theirs.length, commission: theirs.reduce((sum, b) => sum + b.partner_cents, 0) };
  };

  return (
    <>
      <AdminTitle title="Pousadas afiliadas" subtitle={`${partners.length} cadastradas`} />
      {partners.length === 0 ? (
        <EmptyState>Nenhuma pousada cadastrada. Pousadas criam conta no app Vento Pousada (/pousada/criar-conta).</EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {partners.map((partner) => {
            const { count, commission } = stats(partner.id);
            return (
              <li key={partner.id} className="rounded-[18px] border border-line bg-surface p-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[14px] bg-[linear-gradient(135deg,#3a2316,#1d2a42)]" aria-hidden="true">
                    <Icon name="home" className="!h-7 !w-7 text-brand" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[16px] font-semibold text-ink">{partner.name}</p>
                      <Badge tone={partner.status === 'approved' ? 'success' : 'warning'}>{partner.status === 'approved' ? 'Ativa' : 'Em análise'}</Badge>
                    </div>
                    <p className="text-[12px] text-muted">{partner.beach?.name ?? '—'} · {partner.code}</p>
                    <p className="tabular mt-1.5 text-[12px] text-label">
                      {count} reserva(s) · {formatMoney(commission)} em comissão · {formatBps(partner.commission_bps)}
                    </p>
                  </div>
                </div>
                {partner.status === 'pending' ? (
                  <ActionForm action={approvePartner} submitLabel="Aprovar pousada" className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <input type="hidden" name="partnerId" value={partner.id} />
                    <input name="reason" required minLength={3} placeholder="Motivo (fica no histórico)" aria-label="Motivo" className={`${inputClass} !h-10 max-w-60`} />
                  </ActionForm>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Note className="mt-4" title="Como a indicação gera comissão">
        A pousada recebe um percentual do total das aulas reservadas pelo link dela, pago da comissão da plataforma.
      </Note>
    </>
  );
}
