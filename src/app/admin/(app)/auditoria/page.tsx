import type { Metadata } from 'next';

import { AdminTitle } from '@/components/admin/kit';
import { Icon, type IconName } from '@/components/icon';
import { EmptyState } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAuditLogs } from '@/lib/data';
import { formatDateShort, formatTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Auditoria' };

const ACTIONS: Readonly<Record<string, { label: string; icon: IconName }>> = {
  'booking.created': { label: 'Reserva criada', icon: 'book' },
  'booking.payment_confirmed_test': { label: 'Pagamento de teste confirmado', icon: 'wallet' },
  'meeting.recorded': { label: 'Aula registrada', icon: 'check' },
  'price.published': { label: 'Novo preço publicado', icon: 'sliders' },
  'instructor.status_changed': { label: 'Situação de instrutor alterada', icon: 'users' },
  'partner.status_changed': { label: 'Situação de afiliado alterada', icon: 'link' },
  'beach.created': { label: 'Praia cadastrada', icon: 'pin' },
  'beach.updated': { label: 'Praia alterada', icon: 'pin' },
  'profile.promoted_admin': { label: 'Administrador promovido', icon: 'shield' },
};

/** The append-only audit log. Nothing here can be edited or deleted. */
export default async function AuditPage() {
  await requireRole(['admin'], '/admin/auditoria');
  const entries = await listAuditLogs(150);
  return (
    <>
      <AdminTitle title="Auditoria de atividades" subtitle="Registro permanente: não pode ser editado nem apagado." />
      {entries.length === 0 ? (
        <EmptyState>Nenhuma atividade registrada.</EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-[18px] border border-line bg-surface">
          {entries.map((entry) => {
            const known = ACTIONS[entry.action] ?? { label: entry.action, icon: 'list' as IconName };
            return (
              <li key={entry.id} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand" aria-hidden="true">
                  <Icon name={known.icon} className="!h-[18px] !w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">{known.label}</p>
                  <p className="text-[12px] text-muted">
                    {entry.actor?.full_name || 'Sistema'} · {formatDateShort(entry.created_at)} às {formatTime(entry.created_at)}
                  </p>
                  {entry.reason ? <p className="mt-1 text-[12px] text-label">“{entry.reason}”</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
