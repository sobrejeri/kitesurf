import type { Metadata } from 'next';

import { AdminTitle, Panel, PhotoTile } from '@/components/admin/kit';
import { Icon } from '@/components/icon';
import { Badge, EmptyState } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listQueue } from '@/lib/data';
import { VALIDATION_WITHOUT_CHECKOUT } from '@/lib/booking-mode';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Minha prioridade' };

const RULES = [
  ['Recusou?', 'Sua posição permanece.'],
  ['Deixou expirar?', 'Sua posição permanece.'],
  [VALIDATION_WITHOUT_CHECKOUT ? 'Aluno confirmou a aula?' : 'Aluno confirmou e pagou?', 'Você vai para o final.'],
] as const;

export default async function QueuePage() {
  const viewer = await requireRole(['instructor'], '/instrutor/fila');
  const queue = await listQueue();
  const position = queue.findIndex((row) => row.id === viewer.id) + 1;
  return (
    <>
      <AdminTitle title="Minha prioridade" subtitle="Sua posição na fila e quando ela muda." />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel>
          <div className="mb-3 flex items-center gap-4 rounded-[12px] border border-note-line bg-brand-wash px-5 py-4">
            <span className="tabular text-[34px] font-bold leading-none text-brand">{position > 0 ? `${position}º` : '—'}</span>
            <span className="text-[14px] font-medium text-ink">
              {position > 0 ? 'Sua posição na fila' : 'Você entra na fila após a aprovação'}
            </span>
          </div>
          {queue.length === 0 ? (
            <EmptyState>Nenhum instrutor aprovado ainda.</EmptyState>
          ) : (
            <ol className="divide-y divide-line">
              {queue.map((row, index) => (
                <li key={row.id} className="flex items-center gap-3 py-3">
                  <span className="tabular w-7 text-[14px] font-semibold text-muted">{index + 1}º</span>
                  <PhotoTile initials={initials(row.profile?.full_name)} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">
                      {row.profile?.full_name}
                      {row.id === viewer.id ? <span className="font-normal text-brand"> · você</span> : null}
                    </p>
                    <p className="truncate text-[12px] text-muted">{row.beaches.map((b) => b.name).join(', ') || '—'}</p>
                  </div>
                  <Badge>Disponível</Badge>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel title="O que muda minha posição?" className="self-start">
          <ul className="grid gap-3">
            {RULES.map(([question, answer]) => (
              <li key={question} className="flex gap-2.5 text-[13px]">
                <Icon name="check" className="!h-4 !w-4 shrink-0 text-brand" />
                <span><strong className="font-semibold text-ink">{question}</strong> <span className="text-muted">{answer}</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-muted">Pedidos só chegam para horários livres e para as praias e idiomas do seu perfil.</p>
        </Panel>
      </div>
    </>
  );
}
