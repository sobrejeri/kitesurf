import type { Metadata } from 'next';

import { Icon } from '@/components/icon';
import { Toggle } from '@/components/interactive';
import { QueueList } from '@/components/shared';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { QUEUE } from '@/data/demo';

export const metadata: Metadata = { title: 'Minha prioridade' };

const RULES = [
  ['Recusou?', 'Sua posição permanece.'],
  ['Deixou expirar?', 'Sua posição permanece.'],
  ['Aluno confirmou e pagou?', 'Você vai para o final.'],
] as const;

export default function QueuePage() {
  return (
    <>
      <PageHeader
        eyebrow="Distribuição de oportunidades"
        title="Sua prioridade está guardada."
        lead="Acompanhe sua posição e entenda quando a fila muda."
        action={<Toggle label="Disponível para pedidos" />}
      />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="mb-3 flex items-center gap-4 rounded-search bg-brand-tint px-5 py-4">
            <span className="text-[28px] font-semibold text-brand">1º</span>
            <span className="text-[13px] font-[550] text-brand">Sua posição na fila</span>
          </div>
          <QueueList entries={QUEUE} highlightFirst />
        </Card>
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="text-[16px]">O que muda minha posição?</h2>
            <ul className="mt-3 grid gap-3">
              {RULES.map(([question, answer]) => (
                <li key={question} className="flex gap-2.5 text-[12px]">
                  <Icon name="check" className="!h-4 !w-4 text-brand" />
                  <span><strong className="font-[550]">{question}</strong> <span className="text-muted">{answer}</span></span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="text-[16px]">E se eu estiver dando uma aula?</h2>
            <p className="mt-2 text-[12px] text-muted">
              Pedidos só chegam para horários livres na sua agenda. Uma aula em andamento não tira sua vez.
            </p>
          </Card>
          <div>
            <h2 className="mb-3 text-[16px]">Seu histórico recente</h2>
            <EmptyState>Sem ofertas recebidas na demonstração.</EmptyState>
          </div>
        </div>
      </div>
    </>
  );
}
