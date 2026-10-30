import type { Metadata } from 'next';

import { EventLog, QueueList } from '@/components/shared';
import { Button, ButtonLink, Card, EmptyState, Eyebrow, Note, PageHeader } from '@/components/ui';
import { OPERATION_RULES, QUEUE } from '@/data/demo';

export const metadata: Metadata = { title: 'Fila e distribuição' };

export default function DistributionPage() {
  const rules = [
    ['Resposta por oferta', OPERATION_RULES.offerResponse],
    ['Busca total', OPERATION_RULES.searchTotal],
    ['Pagamento', OPERATION_RULES.payment],
    ['Pausa após', OPERATION_RULES.pauseAfter],
  ] as const;
  return (
    <>
      <PageHeader
        eyebrow="Controle da distribuição"
        title="Fila e solicitações"
        lead="Veja cada encaminhamento e a prioridade que permanece guardada."
        action={<Button variant="ghost" size="sm">Abrir simulação</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[16px]">Fila central</h2>
                <p className="text-[11px] text-muted">A ordem é aplicada entre instrutores compatíveis.</p>
              </div>
              <span className="text-[11px] text-muted">{QUEUE.length} instrutores</span>
            </div>
            <div className="mt-3"><QueueList entries={QUEUE} /></div>
            <Note className="mt-3">A posição muda depois do pagamento confirmado. Recusas, expirações e pausas preservam a prioridade.</Note>
          </Card>
          <Card>
            <h2 className="mb-4 text-[16px]">Histórico da distribuição</h2>
            <EventLog />
          </Card>
        </div>
        <div className="grid content-start gap-5">
          <div>
            <Eyebrow>Solicitação atual</Eyebrow>
            <div className="mt-3">
              <EmptyState action={<ButtonLink href="/aluno/reservar" size="sm">Criar solicitação de teste</ButtonLink>}>
                Nenhum pedido em andamento. Experimente solicitar uma aula na área do aluno.
              </EmptyState>
            </div>
          </div>
          <Card>
            <h2 className="text-[16px]">Regras em uso</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              {rules.map(([label, value]) => (
                <div key={label} className="rounded-search bg-brand-tint p-3">
                  <dt className="text-[11px] text-muted">{label}</dt>
                  <dd className="mt-1 text-[15px] font-semibold text-brand">{value}</dd>
                </div>
              ))}
            </dl>
            <ButtonLink href="/admin/regras" variant="ghost" size="sm" className="mt-4">Editar parâmetros</ButtonLink>
          </Card>
        </div>
      </div>
    </>
  );
}
