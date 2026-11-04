import type { Metadata } from 'next';

import { Avatar, Badge, Card, EmptyState, Note, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listQueue } from '@/lib/data';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Fila e distribuição' };

export default async function DistributionPage() {
  await requireRole(['admin'], '/admin/distribuicao');
  const queue = await listQueue();
  return (
    <>
      <PageHeader eyebrow="Controle da distribuição" title="Fila e solicitações" lead="A ordem é aplicada entre instrutores compatíveis com praia, idioma e horário." />
      <Card>
        {queue.length === 0 ? (
          <EmptyState>Nenhum instrutor aprovado.</EmptyState>
        ) : (
          <ol className="divide-y divide-line">
            {queue.map((row, index) => (
              <li key={row.id} className="flex items-center gap-3 py-3">
                <span className="tabular w-6 text-[13px] font-[550] text-muted">{index + 1}º</span>
                <Avatar initials={initials(row.profile?.full_name)} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-[550]">{row.profile?.full_name}</p>
                  <p className="text-[11px] text-muted">{row.beaches.map((b) => b.name).join(' e ')} · {row.languages.join(', ')}</p>
                </div>
                <Badge>Na fila</Badge>
              </li>
            ))}
          </ol>
        )}
        <Note className="mt-3">A posição muda depois da confirmação da aula: o instrutor que recebeu a reserva vai para o final. A disponibilidade é conferida para cada horário solicitado. Recusas, expirações e pausas preservam a prioridade.</Note>
      </Card>
    </>
  );
}
