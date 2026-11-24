import type { Metadata } from 'next';
import Link from 'next/link';

import { unblockInstructorTime } from '@/app/actions/availability';
import { ActionForm } from '@/components/action-form';
import { AgendaCalendar, agendaHref, type AgendaEntry, type AgendaExtra, type AgendaTimeOff } from '@/components/instructor/agenda-calendar';
import { TimeOffForm } from '@/components/instructor/time-off-form';
import { ButtonLink, Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listBookingsForInstructor } from '@/lib/data';
import { formatDateLong, formatTime } from '@/lib/format';
import {
  TIME_OFF_LABELS, hhmm, isDayKey, localDayKey, viewRange, type AgendaView, type DayShift, type TimeOffKind,
} from '@/lib/instructor-agenda';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Agenda e bloqueios' };

type RawOff = { id: string; starts_at: string; ends_at: string; reason: string; kind?: TimeOffKind };
type Shift = { weekday: number; opens_at: string; closes_at: string };
type Pause = { weekday: number; starts_at: string; ends_at: string };
type RawExtra = { day: string; opens_at: string; closes_at: string };
const HOLD_MS = 10 * 60_000;
const VIEWS: readonly { id: AgendaView; label: string }[] = [{ id: 'day', label: 'Dia' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mês' }];

export default async function InstructorAgendaPage({ searchParams }: { searchParams: Promise<{ visao?: string; dia?: string }> }) {
  const viewer = await requireRole(['instructor'], '/instrutor/agenda');
  const params = await searchParams;
  const view: AgendaView = params.visao === 'day' || params.visao === 'month' ? params.visao : 'week';
  const today = localDayKey(Date.now());
  const date = isDayKey(params.dia) ? params.dia : today;
  const range = viewRange(date, view);
  const db = await createSupabaseServerClient();

  const [bookings, offResult, shiftResult, pauseResult, extraResult] = await Promise.all([
    listBookingsForInstructor(viewer.id),
    db.from('instructor_time_off').select('id,starts_at,ends_at,reason,kind').eq('instructor_id', viewer.id)
      .gte('ends_at', new Date().toISOString()).order('starts_at', { ascending: true }).returns<RawOff[]>(),
    db.from('instructor_weekly_hours').select('weekday,opens_at,closes_at').eq('instructor_id', viewer.id).returns<Shift[]>(),
    db.from('instructor_weekly_breaks').select('weekday,starts_at,ends_at').eq('instructor_id', viewer.id).order('starts_at').returns<Pause[]>(),
    db.from('instructor_extra_hours').select('day,opens_at,closes_at').eq('instructor_id', viewer.id).gte('day', range.first).lt('day', range.last).returns<RawExtra[]>(),
  ]);
  // Before the v2 migration the "kind" column does not exist: read the older shape instead of failing the whole page.
  const offRows = offResult.error
    ? (await db.from('instructor_time_off').select('id,starts_at,ends_at,reason').eq('instructor_id', viewer.id)
        .gte('ends_at', new Date().toISOString()).order('starts_at', { ascending: true }).returns<RawOff[]>())
    : offResult;
  const blocks: AgendaTimeOff[] = (offRows.data ?? []).map((row) => ({
    id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, reason: row.reason, kind: row.kind ?? 'block',
  }));

  const now = Date.now();
  const entries: AgendaEntry[] = bookings
    .filter((b) => b.status === 'confirmed' || (b.status === 'awaiting_payment' && now - new Date(b.created_at).getTime() < HOLD_MS))
    .flatMap((b) => b.booking_meetings
      .filter((m) => m.status === 'scheduled' || m.status === 'in_progress')
      .map((m): AgendaEntry => ({
        id: m.id, startsAt: m.starts_at, minutes: m.minutes,
        title: `${b.is_test ? '[AULA TESTE] ' : ''}${b.student?.full_name ?? 'Aluno'}`,
        subtitle: `${b.beach?.name ?? 'Praia'} · ${b.code}`,
        href: b.status === 'confirmed'
          ? `/instrutor/aula?aba=${m.status === 'in_progress' ? 'andamento' : 'proximas'}&aula=${m.id}#detalhes-aula`
          : '/instrutor/agenda',
        state: b.status === 'awaiting_payment' ? 'hold' : m.status === 'in_progress' ? 'in_progress' : 'scheduled',
      })))
    .filter((entry) => entry.startsAt >= range.startsAt && entry.startsAt < range.endsAt && new Date(entry.startsAt).getTime() + entry.minutes * 60_000 > 0)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const shifts = new Map<number, DayShift>();
  for (const shift of shiftResult.data ?? []) shifts.set(shift.weekday, { weekday: shift.weekday, opens: hhmm(shift.opens_at), closes: hhmm(shift.closes_at), breaks: [] });
  for (const pause of pauseResult.data ?? []) shifts.get(pause.weekday)?.breaks.push({ from: hhmm(pause.starts_at), to: hhmm(pause.ends_at) });
  const extras = new Map<string, AgendaExtra>((extraResult.data ?? []).map((row) => [row.day, { day: row.day, opens: hhmm(row.opens_at), closes: hhmm(row.closes_at) }]));
  const visibleBlocks = blocks.filter((item) => item.startsAt < range.endsAt && item.endsAt > range.startsAt);
  const timeOffReady = !offRows.error;

  return (
    <>
      <PageHeader title="Minha agenda" eyebrow="Programação real"
        lead="Aulas confirmadas, turnos, pausas, folgas e férias. Tudo o que você registra vale para novas reservas." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <nav aria-label="Período da agenda" className="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
            <Link href={agendaHref(range.previous, view)} aria-label="Período anterior" className="press flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line px-3 text-brand">‹</Link>
            <Link href={agendaHref(today, view)} className="press flex min-h-11 items-center rounded-full border border-line px-4 font-semibold text-brand">Hoje</Link>
            <Link href={agendaHref(range.next, view)} aria-label="Próximo período" className="press flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line px-3 text-brand">›</Link>
            <span className="ml-auto flex overflow-hidden rounded-full border border-line" role="group" aria-label="Visão">
              {VIEWS.map((item) => (
                <Link key={item.id} href={agendaHref(date, item.id)} aria-current={view === item.id ? 'page' : undefined}
                  className={`flex min-h-11 items-center px-4 font-semibold ${view === item.id ? 'bg-brand text-on-brand' : 'text-label'}`}>{item.label}</Link>
              ))}
            </span>
          </nav>
          <form action="/instrutor/agenda" className="mb-4 flex flex-wrap items-center gap-2">
            <input type="hidden" name="visao" value={view} />
            <label className="sr-only" htmlFor="agenda-dia">Ir para a data</label>
            <input id="agenda-dia" type="date" name="dia" defaultValue={date} className={`${inputClass} !w-auto`} />
            <button className="press min-h-11 rounded-full border border-line px-4 text-[13px] font-semibold text-brand">Ir</button>
          </form>
          <AgendaCalendar view={view} date={date} entries={entries} off={visibleBlocks} shifts={shifts} extras={extras} today={today} />
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/instrutor/disponibilidade" variant="ghost">Configurar dias, turnos e pausas</ButtonLink>
            <ButtonLink href="/instrutor/pontos" variant="ghost">Definir pontos de encontro</ButtonLink>
          </div>
        </Card>
        <Card>
          <h2 className="text-[18px] font-bold">Folga, férias ou bloqueio</h2>
          {!timeOffReady ? (
            <Note tone="warning" className="mt-3">Execute a migração de disponibilidade para ativar os bloqueios reais.</Note>
          ) : (
            <>
              <p className="mt-1 text-[12px] text-muted">Nenhuma aula confirmada é apagada: se houver aula no período, o sistema recusa e você combina o reagendamento.</p>
              <TimeOffForm today={today} />
              <h3 className="mt-5 text-[15px] font-semibold">Registrados</h3>
              {blocks.length === 0 ? <p className="mt-2 text-[13px] text-muted">Nada registrado.</p> : (
                <ul className="mt-2 divide-y divide-line">
                  {blocks.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <span className="text-[12px] text-muted">
                        {item.kind === 'block' ? (
                          <>
                            <strong className="block text-ink">{TIME_OFF_LABELS.block} · {formatDateLong(item.startsAt)} · {formatTime(item.startsAt)}</strong>
                            Até {formatDateLong(item.endsAt)} · {formatTime(item.endsAt)}{item.reason ? ` · ${item.reason}` : ''}
                          </>
                        ) : (
                          <>
                            <strong className="block text-ink">{TIME_OFF_LABELS[item.kind]} · dias inteiros</strong>
                            {formatDateLong(item.startsAt)}{localDayKey(item.startsAt) === localDayKey(new Date(new Date(item.endsAt).getTime() - 1)) ? '' : ` a ${formatDateLong(new Date(new Date(item.endsAt).getTime() - 1).toISOString())}`}{item.reason ? ` · ${item.reason}` : ''}
                          </>
                        )}
                      </span>
                      <ActionForm action={unblockInstructorTime} submitLabel="Remover" submitVariant="ghost" className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="blockId" value={item.id} />
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
