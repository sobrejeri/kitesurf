import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminBookingsTable } from '@/components/admin-tables';
import { Icon } from '@/components/icon';
import { SectionTitle } from '@/components/shared';
import { Avatar, Badge, Card, EmptyState, StatCard } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllBookings, listAllInstructors, listAllPartners } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Visão geral' };

export default async function OverviewPage() {
  await requireRole(['admin'], '/admin/visao');
  const [bookings, instructors, partners] = await Promise.all([listAllBookings(), listAllInstructors(), listAllPartners()]);
  const approved = instructors.filter((i) => i.status === 'approved').sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
  const pending = instructors.filter((i) => i.status === 'pending');
  const pendingPartners = partners.filter((p) => p.status === 'pending');
  const paid = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed');
  const volume = paid.reduce((sum, b) => sum + b.total_cents, 0);

  return (
    <>
      <h1 className="mb-6 text-[28px] tracking-[-0.9px] sm:text-[32px]">Visão geral</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard highlight label="Instrutores ativos" value={String(approved.length)} hint={`${pending.length} aguardando análise`} icon="users" />
        <StatCard label="Reservas" value={String(bookings.length)} hint={`${paid.length} pagas`} icon="calendar" />
        <StatCard label="Volume confirmado" value={formatMoney(volume)} hint="Pagamentos de teste" icon="wallet" />
        <StatCard label="Aguardando pagamento" value={String(bookings.filter((b) => b.status === 'awaiting_payment').length)} hint="Instrutor reservado" icon="clock" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <SectionTitle title="Fila de instrutores" action={{ label: 'Ver instrutores', href: '/admin/instrutores' }} />
          {approved.length === 0 ? (
            <EmptyState>Nenhum instrutor aprovado. Aprove cadastros em Instrutores.</EmptyState>
          ) : (
            <ol className="divide-y divide-line">
              {approved.map((row, index) => (
                <li key={row.id} className="flex items-center gap-3 py-3">
                  <span className="tabular w-6 text-[13px] font-[550] text-muted">{index + 1}º</span>
                  <Avatar initials={initials(row.profile?.full_name)} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-[550]">{row.profile?.full_name}</p>
                    <p className="text-[11px] text-muted">{row.beaches.map((b) => b.name).join(' e ') || 'Sem praia'}</p>
                  </div>
                  <Badge>Disponível</Badge>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card className="self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px]">Precisa da sua atenção</h2>
            <Badge tone={pending.length + pendingPartners.length ? 'warning' : 'success'}>
              {pending.length + pendingPartners.length} pendente(s)
            </Badge>
          </div>
          <ul className="mt-4 grid gap-3">
            {pending.map((row) => (
              <li key={row.id} className="flex items-center gap-3">
                <Avatar initials={initials(row.profile?.full_name)} tone="a2" />
                <div className="flex-1">
                  <p className="text-[13px] font-[550]">{row.profile?.full_name}</p>
                  <p className="text-[11px] text-muted">Instrutor aguardando análise</p>
                </div>
                <Link href="/admin/instrutores" className="flex items-center gap-1 text-[13px] font-[550] text-brand"><Icon name="arrow" className="!h-4 !w-4" /> Analisar</Link>
              </li>
            ))}
            {pendingPartners.map((row) => (
              <li key={row.id} className="flex items-center gap-3">
                <Avatar initials={initials(row.name)} tone="a4" />
                <div className="flex-1">
                  <p className="text-[13px] font-[550]">{row.name}</p>
                  <p className="text-[11px] text-muted">Pousada aguardando aprovação</p>
                </div>
                <Link href="/admin/afiliados" className="flex items-center gap-1 text-[13px] font-[550] text-brand"><Icon name="arrow" className="!h-4 !w-4" /> Analisar</Link>
              </li>
            ))}
            {pending.length + pendingPartners.length === 0 ? <li className="text-[12px] text-muted">Nada pendente.</li> : null}
          </ul>
        </Card>
      </div>

      <section className="mt-8">
        <SectionTitle title="Reservas recentes" action={{ label: 'Todas as reservas', href: '/admin/reservas' }} />
        <Card className="!p-2">
          <AdminBookingsTable bookings={bookings.slice(0, 8)} />
        </Card>
      </section>
    </>
  );
}
