import type { Metadata } from 'next';

import { AdminTitle, LineChart, Metric, Panel, PanelLink, QuickTile } from '@/components/admin/kit';
import { Icon } from '@/components/icon';
import { requireRole } from '@/lib/auth';
import { listAllBookings, listAllInstructors } from '@/lib/data';
import { dayKey, lastDays } from '@/lib/dates';
import { formatDateLong, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Visão geral' };

/**
 * Operation at a glance. Every money figure is a sum of bookings' frozen
 * snapshots, computed when each booking was created.
 */
export default async function OverviewPage() {
  await requireRole(['admin'], '/admin/visao');
  const [bookings, instructors] = await Promise.all([listAllBookings(500), listAllInstructors()]);

  const approved = instructors.filter((i) => i.status === 'approved').length;
  const pendingInstructors = instructors.filter((i) => i.status === 'pending').length;
  const paid = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed');
  const awaiting = bookings.filter((b) => b.status === 'awaiting_payment');
  const volume = paid.reduce((sum, b) => sum + b.total_cents, 0);
  const awaitingValue = awaiting.reduce((sum, b) => sum + b.total_cents, 0);

  const days = lastDays(7);
  const perDay = days.map((day) => ({
    label: day.label.slice(0, 5),
    value: bookings.filter((b) => dayKey(b.created_at) === day.key).length,
  }));

  return (
    <>
      <AdminTitle title="Visão geral" subtitle="Acompanhe a operação em tempo real." />

      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-12 flex-1 items-center gap-3 rounded-[14px] border border-line bg-surface px-4 text-[14px] text-ink">
          <Icon name="calendar" className="!h-5 !w-5 text-label" />
          Hoje, {formatDateLong(new Date().toISOString())}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Instrutores ativos" value={String(approved)} hint={pendingInstructors ? `${pendingInstructors} em análise` : 'Nenhum em análise'} hintTone={pendingInstructors ? 'brand' : 'muted'} icon="users" tone="blue" />
        <Metric label="Reservas" value={String(bookings.length)} hint={`${awaiting.length} pendentes`} hintTone={awaiting.length ? 'brand' : 'muted'} icon="calendar" tone="orange" />
        <Metric label="Volume confirmado" value={formatMoney(volume)} hint={`${paid.length} pagas`} hintTone="success" icon="wallet" tone="green" />
        <Metric label="Aguardando pagamento" value={String(awaiting.length)} hint={formatMoney(awaitingValue)} hintTone="brand" icon="clock" tone="purple" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Reservas nos últimos 7 dias" action={<PanelLink href="/admin/reservas" label="Ver tudo" />}>
          <LineChart points={perDay} unit="reservas" />
        </Panel>

        <Panel title="Acesso rápido">
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
            <QuickTile href="/admin/instrutores" label="Instrutores" icon="users" tone="orange" />
            <QuickTile href="/admin/reservas" label="Reservas" icon="calendar" tone="blue" />
            <QuickTile href="/admin/financeiro" label="Financeiro" icon="wallet" tone="green" />
            <QuickTile href="/admin/praias" label="Praias" icon="pin" tone="blue" />
          </div>
        </Panel>
      </div>
    </>
  );
}
