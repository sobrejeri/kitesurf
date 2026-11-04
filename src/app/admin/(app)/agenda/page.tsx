import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminTitle } from '@/components/admin/kit';
import { Badge, ButtonLink, Card, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { adminAgendaRange, type AgendaView } from '@/lib/admin-agenda-range';
import { MEETING_STATUS_LABELS, type Meeting } from '@/lib/data';
import { lessonDate, dayKey } from '@/lib/dates';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Agenda de aulas' };
interface Entry extends Meeting {
  booking_id: string;
  booking: {
    code: string; status: string; is_test: boolean;
    student: { full_name: string } | null;
    instructor: { profile: { full_name: string } | null } | null;
    beach: { name: string } | null;
  };
}

export default async function AdminAgendaPage({ searchParams }: {
  searchParams: Promise<{ dia?: string; visao?: string }>;
}) {
  await requireRole(['admin'], '/admin/agenda');
  const params = await searchParams;
  const view: AgendaView = params.visao === 'day' || params.visao === 'month' ? params.visao : 'week';
  let date = params.dia ?? lessonDate();
  try { adminAgendaRange(date, view); } catch { date = lessonDate(); }
  const range = adminAgendaRange(date, view);
  const db = await createSupabaseServerClient();
  const entries: Entry[] = [];
  // Fetch the whole date range, independent of booking creation order or API row caps.
  for (let offset = 0; ; offset += 500) {
    const result = await db.from('booking_meetings').select(`
      id,booking_id,position,starts_at,minutes,status,done_minutes,note,
      booking:bookings!booking_meetings_booking_id_fkey(
        code,status,is_test,student:profiles!bookings_student_id_fkey(full_name),
        instructor:instructors!bookings_instructor_id_fkey(profile:profiles!instructors_id_fkey(full_name)),
        beach:beaches!bookings_beach_id_fkey(name))
    `).gte('starts_at', range.startsAt).lt('starts_at', range.endsAt)
      .order('starts_at').order('id').range(offset, offset + 499).returns<Entry[]>();
    if (result.error) {
      console.error('[admin.agenda]', { code: result.error.code, message: result.error.message });
      throw new Error('Não foi possível consultar a agenda da operação.');
    }
    entries.push(...result.data ?? []);
    if ((result.data?.length ?? 0) < 500) break;
  }
  const days = new Map<string, Entry[]>();
  for (const entry of entries) {
    const day = dayKey(entry.starts_at);
    days.set(day, [...days.get(day) ?? [], entry]);
  }
  const href = (day: string, mode = view) => `/admin/agenda?dia=${day}&visao=${mode}`;
  return (
    <>
      <AdminTitle title="Agenda de aulas" subtitle={`${entries.length} encontro(s) no período selecionado`} />
      <Card>
        <form action="/admin/agenda" className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-[13px] text-label">Data de referência
            <input name="dia" type="date" required defaultValue={date} className={inputClass} />
          </label>
          <input type="hidden" name="visao" value={view} />
          <button className="btn-primary min-h-12 rounded-full px-5 text-[13px] font-semibold">Filtrar</button>
          <ButtonLink href="/admin/aula-teste" icon="plus" variant="ghost">Nova aula de teste</ButtonLink>
        </form>
        <nav aria-label="Período da agenda" className="mt-4 flex flex-wrap items-center gap-4 text-[13px]">
          <Link href={href(range.previousDate)} className="text-brand underline">Dia anterior</Link>
          <Link href={href(lessonDate())} className="text-brand underline">Hoje</Link>
          <Link href={href(range.nextDate)} className="text-brand underline">Próximo dia</Link>
          {([['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']] as const).map(([mode, label]) => (
            <Link key={mode} href={href(date, mode)} aria-current={view === mode ? 'page' : undefined}
              className={`rounded-full border border-line px-4 py-2 ${view === mode ? 'bg-brand-soft font-bold text-brand' : 'text-label'}`}>{label}</Link>
          ))}
        </nav>
      </Card>
      <div className="mt-5 grid gap-5">
        {entries.length === 0 ? <Card>Nenhum encontro nesse período.</Card> : null}
        {[...days].map(([day, meetings]) => (
          <section key={day}>
            <h2 className="mb-3 text-[16px] font-bold text-ink">{formatDateLong(`${day}T12:00:00-03:00`)}</h2>
            <ul className="grid gap-2">
              {meetings.map((meeting) => (
                <li key={meeting.id}>
                  <Link href={`/admin/reservas/${meeting.booking_id}`} className="flex flex-wrap items-center gap-4 rounded-[16px] border border-line bg-surface p-4">
                    <span className="tabular font-bold text-brand">{formatTime(meeting.starts_at)}<small className="block font-normal text-muted">{formatMinutes(meeting.minutes)}</small></span>
                    <span className="min-w-0 flex-1 text-[13px]">
                      <strong className="block text-ink">{meeting.booking.code}{meeting.booking.is_test ? ' · TESTE' : ''}</strong>
                      <span className="text-label">{meeting.booking.student?.full_name || 'Aluno'} · {meeting.booking.instructor?.profile?.full_name || 'Instrutor a definir'}</span>
                      <span className="block text-muted">{meeting.booking.beach?.name ?? 'Praia'} · Encontro {meeting.position}</span>
                    </span>
                    <Badge tone={meeting.status === 'done' ? 'success' : 'quiet'}>
                      {meeting.booking.status === 'cancelled' ? 'Reserva cancelada' : MEETING_STATUS_LABELS[meeting.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
