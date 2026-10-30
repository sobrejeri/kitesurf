import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { BookingsTable, EventLog, QueueList, SectionTitle } from '@/components/shared';
import { Avatar, Badge, Card, StatCard } from '@/components/ui';
import { BOOKING, QUEUE } from '@/data/demo';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Visão geral' };

export default function OverviewPage() {
  return (
    <>
      <h1 className="mb-6 text-[28px] tracking-[-0.9px] sm:text-[32px]">Visão geral</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="Instrutores ativos" value="4" hint="4 cadastros aprovados" icon="users" />
        <StatCard label="Reservas" value="1" hint="Inclui exemplos e testes" icon="calendar" />
        <StatCard label="Volume de reservas" value={formatMoney(BOOKING.totalCents)} hint="Valores demonstrativos" icon="wallet" />
        <StatCard label="Busca ativa" value="0" hint="Distribuição sequencial" icon="wind" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <SectionTitle title="Fila de instrutores" action={{ label: 'Ver fila', href: '/admin/distribuicao' }} />
          <QueueList entries={QUEUE} />
          <p className="mt-3 rounded-input border border-line bg-canvas px-3 py-2.5 text-[11px] text-muted">Sem solicitações no momento.</p>
          <Link href="/admin/regras" className="mt-3 flex items-center gap-1 rounded-input border border-line px-3 py-3 text-[12px] font-[550] text-label">
            Regras da fila <Icon name="chevron" className="!h-4 !w-4" />
          </Link>
        </Card>
        <div className="grid content-start gap-5">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-[16px]">Precisa da sua atenção</h2>
              <Badge tone="warning">1 cadastro</Badge>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Avatar initials="CR" tone="a2" />
              <div className="flex-1">
                <p className="text-[13px] font-[550]">Camila Rocha</p>
                <p className="text-[11px] text-muted">Cadastro aguardando análise</p>
              </div>
              <Link href="/admin/instrutores" className="flex items-center gap-1 text-[13px] font-[550] text-brand">
                <Icon name="arrow" className="!h-4 !w-4" /> Analisar
              </Link>
            </div>
          </Card>
          <Card>
            <h2 className="mb-4 text-[16px]">Últimos acontecimentos</h2>
            <EventLog />
          </Card>
        </div>
      </div>

      <section className="mt-8">
        <SectionTitle title="Reservas recentes" action={{ label: 'Todas as reservas', href: '/admin/reservas' }} />
        <Card className="!p-2">
          <BookingsTable totalLabel={formatMoney(BOOKING.totalCents)} />
        </Card>
      </section>
    </>
  );
}
