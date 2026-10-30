import type { Metadata } from 'next';

import { Icon } from '@/components/icon';
import { Avatar, Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { BEACH_LABELS, listQueue } from '@/lib/data';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Minha prioridade' };

const RULES = [
  ['Recusou?', 'Sua posição permanece.'],
  ['Deixou expirar?', 'Sua posição permanece.'],
  ['Aluno confirmou e pagou?', 'Você vai para o final.'],
] as const;

export default async function QueuePage() {
  const viewer = await requireRole(['instructor'], '/instrutor/fila');
  const queue = await listQueue();
  const position = queue.findIndex((row) => row.id === viewer.id) + 1;
  return (
    <>
      <PageHeader eyebrow="Distribuição de oportunidades" title="Sua prioridade está guardada." lead="Acompanhe sua posição e entenda quando a fila muda." />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="mb-3 flex items-center gap-4 rounded-search bg-brand-tint px-5 py-4">
            <span className="text-[28px] font-semibold text-brand">{position > 0 ? `${position}º` : '—'}</span>
            <span className="text-[13px] font-[550] text-brand">{position > 0 ? 'Sua posição na fila' : 'Você entra na fila após a aprovação'}</span>
          </div>
          {queue.length === 0 ? (
            <EmptyState>Nenhum instrutor aprovado ainda.</EmptyState>
          ) : (
            <ol className="divide-y divide-line">
              {queue.map((row, index) => (
                <li key={row.id} className="flex items-center gap-3 py-3">
                  <span className="tabular w-6 text-[13px] font-[550] text-muted">{index + 1}º</span>
                  <Avatar initials={initials(row.profile?.full_name)} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-[550]">
                      {row.profile?.full_name}
                      {row.id === viewer.id ? <span className="font-normal text-muted"> · você</span> : null}
                    </p>
                    <p className="text-[11px] text-muted">{row.beaches.map((b) => BEACH_LABELS[b]).join(' e ') || '—'}</p>
                  </div>
                  <Badge>Disponível</Badge>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card className="self-start">
          <h2 className="text-[16px]">O que muda minha posição?</h2>
          <ul className="mt-3 grid gap-3">
            {RULES.map(([question, answer]) => (
              <li key={question} className="flex gap-2.5 text-[12px]">
                <Icon name="check" className="!h-4 !w-4 text-brand" />
                <span><strong className="font-[550]">{question}</strong> <span className="text-muted">{answer}</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-muted">Pedidos só chegam para horários livres na sua agenda e para as praias e idiomas do seu perfil.</p>
        </Card>
      </div>
    </>
  );
}
