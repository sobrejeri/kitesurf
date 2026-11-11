import Link from 'next/link';

import { Icon, type IconName } from '@/components/icon';
import { Badge, ButtonLink, EmptyState } from '@/components/ui';
import type { Booking, Meeting } from '@/lib/data';
import { formatDateShort, formatMoney, formatTime } from '@/lib/format';

import { AdminTitle, LineChart, Metric, Panel, PanelLink, QuickTile } from './kit';

export interface OverviewLesson {
  booking: Booking;
  meeting: Meeting;
}

interface Attention {
  key: string;
  icon: IconName;
  text: string;
  href: string;
  action: string;
}

/**
 * Admin / Visão geral. Every figure arrives computed from the bookings'
 * frozen snapshots; this only decides the order: what is waiting for the
 * team, the numbers, the week and the next lessons.
 */
export function AdminOverviewView({
  todayLabel,
  approved,
  pendingInstructors,
  bookingsCount,
  awaitingCount,
  awaitingValue,
  unassignedCount,
  volume,
  paidCount,
  perDay,
  upcoming,
}: {
  todayLabel: string;
  approved: number;
  pendingInstructors: number;
  bookingsCount: number;
  awaitingCount: number;
  awaitingValue: number;
  unassignedCount: number;
  volume: number;
  paidCount: number;
  perDay: readonly { label: string; value: number }[];
  upcoming: readonly OverviewLesson[];
}) {
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const attention: Attention[] = [
    pendingInstructors > 0 ? {
      key: 'instructors', icon: 'users', href: '/admin/instrutores', action: 'Analisar',
      text: plural(pendingInstructors, 'instrutor aguarda análise do cadastro', 'instrutores aguardam análise do cadastro'),
    } : null,
    unassignedCount > 0 ? {
      key: 'unassigned', icon: 'list', href: '/admin/distribuicao', action: 'Abrir fila',
      text: plural(unassignedCount, 'reserva está sem instrutor atribuído', 'reservas estão sem instrutor atribuído'),
    } : null,
    awaitingCount > 0 ? {
      key: 'awaiting', icon: 'clock', href: '/admin/reservas', action: 'Ver reservas',
      text: `${plural(awaitingCount, 'reserva aguarda pagamento', 'reservas aguardam pagamento')} · ${formatMoney(awaitingValue)}`,
    } : null,
  ].filter((item): item is Attention => item !== null);

  return (
    <>
      <AdminTitle
        title="Visão geral"
        subtitle={`Hoje é ${todayLabel}.`}
        action={<ButtonLink href="/admin/agenda" variant="ghost" size="sm" icon="calendar">Agenda de aulas</ButtonLink>}
      />

      <section aria-labelledby="precisa-de-atencao" className="mb-4 overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
        <h2 id="precisa-de-atencao" className="flex items-center gap-2 border-b border-line px-4 py-3 text-[13px] font-semibold text-ink sm:px-5">
          <span className={`h-2 w-2 rounded-full ${attention.length ? 'bg-brand' : 'bg-success'}`} aria-hidden="true" />
          {attention.length ? 'Precisa da sua atenção' : 'Tudo em dia'}
        </h2>
        {attention.length === 0 ? (
          <p className="px-4 py-3.5 text-[13px] text-muted sm:px-5">Nenhum cadastro, reserva ou pagamento esperando pela operação.</p>
        ) : (
          <ul className="divide-y divide-line">
            {attention.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 hover:bg-brand-wash sm:px-5">
                  <span className="vk-tone-blue grid h-8 w-8 shrink-0 place-items-center rounded-[9px]" aria-hidden="true">
                    <Icon name={item.icon} className="!h-[18px] !w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 text-[13.5px] font-medium text-ink">{item.text}</span>
                  <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-brand">
                    {item.action} <Icon name="chevron" className="!h-4 !w-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Metric label="Instrutores ativos" value={String(approved)} hint={pendingInstructors ? `${pendingInstructors} em análise` : 'Nenhum em análise'} hintTone={pendingInstructors ? 'brand' : 'muted'} icon="users" tone="blue" />
        <Metric label="Reservas" value={String(bookingsCount)} hint={`${awaitingCount} pendentes`} hintTone={awaitingCount ? 'brand' : 'muted'} icon="book" tone="slate" />
        <Metric label="Volume confirmado" value={formatMoney(volume)} hint={`${paidCount} pagas`} hintTone="success" icon="wallet" tone="green" />
        <Metric label="Aguardando pagamento" value={String(awaitingCount)} hint={formatMoney(awaitingValue)} hintTone="brand" icon="clock" tone="sky" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Reservas nos últimos 7 dias" action={<PanelLink href="/admin/reservas" label="Ver tudo" />}>
          <LineChart points={perDay} unit="reservas" />
        </Panel>

        <Panel title="Próximas aulas" action={<PanelLink href="/admin/agenda" label="Agenda" />}>
          {upcoming.length === 0 ? (
            <EmptyState>Nenhuma aula agendada para os próximos dias.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map(({ booking, meeting }) => (
                <li key={meeting.id}>
                  <Link href={`/admin/reservas/${booking.id}`} className="-mx-2 flex items-center gap-3 rounded-[10px] px-2 py-2.5 hover:bg-brand-wash">
                    <span className="tabular w-[68px] shrink-0 leading-tight">
                      <strong className="block text-[14px] font-semibold text-ink">{formatTime(meeting.starts_at)}</strong>
                      <span className="text-[11.5px] text-muted">{formatDateShort(meeting.starts_at)}</span>
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <strong className="block truncate text-[13.5px] font-semibold text-ink">{booking.student?.full_name ?? 'Aluno'}</strong>
                      <span className="block truncate text-[12px] text-muted">
                        {booking.instructor?.full_name ?? 'Sem instrutor'} · {booking.beach?.name ?? '—'}
                      </span>
                    </span>
                    {meeting.status === 'in_progress' ? <Badge tone="warning">Em aula</Badge> : null}
                    <Icon name="chevron" className="!h-4 !w-4 shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Acesso rápido" className="mt-4">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <QuickTile href="/admin/instrutores" label="Instrutores" icon="users" tone="blue" />
          <QuickTile href="/admin/reservas" label="Reservas" icon="book" tone="slate" />
          <QuickTile href="/admin/financeiro" label="Financeiro" icon="wallet" tone="green" />
          <QuickTile href="/admin/distribuicao" label="Fila" icon="list" tone="sky" />
          <QuickTile href="/admin/praias" label="Praias" icon="pin" tone="blue" />
          <QuickTile href="/admin/documentos" label="Documentos" icon="file" tone="slate" />
        </div>
      </Panel>
    </>
  );
}
