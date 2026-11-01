import type { Metadata } from 'next';

import { blockInstructorTime, unblockInstructorTime } from '@/app/actions/availability';
import { ActionForm } from '@/components/action-form';
import { ButtonLink, Card, Field, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listBookingsForInstructor } from '@/lib/data';
import { formatDateLong, formatTime } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Agenda e bloqueios' };

type TimeOff = { id: string; starts_at: string; ends_at: string; reason: string };

export default async function InstructorAgendaPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/agenda');
  const db = await createSupabaseServerClient();
  const [bookings, blocks] = await Promise.all([
    listBookingsForInstructor(viewer.id),
    db.from('instructor_time_off').select('id,starts_at,ends_at,reason')
      .eq('instructor_id', viewer.id).gte('ends_at', new Date().toISOString())
      .order('starts_at', { ascending: true }).returns<TimeOff[]>(),
  ]);
  const future = bookings.filter((b) => b.status === 'confirmed')
    .flatMap((b) => b.booking_meetings.filter(m => m.status === 'scheduled' || m.status === 'in_progress')
      .map(m => ({ ...m, code: b.code, beach: b.beach?.name ?? 'Praia', student: b.student?.full_name ?? 'Aluno' })))
    .filter((m) => new Date(m.starts_at).getTime() + m.minutes * 60000 > Date.now())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <>
      <PageHeader title="Minha agenda" eyebrow="Programação real"
        lead="Consulte suas aulas confirmadas e bloqueie períodos em que não poderá atender."/>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-[18px] font-bold">Aulas agendadas</h2>
          {future.length === 0 ? <p className="mt-4 text-[13px] text-muted">Nenhuma aula confirmada para os próximos dias.</p> : (
            <ul className="mt-3 divide-y divide-line">
              {future.map(m => <li key={m.id} className="py-3 text-[13px]">
                <strong className="block text-ink">{formatDateLong(m.starts_at)} · {formatTime(m.starts_at)}</strong>
                <span className="text-muted">{m.student} · {m.beach} · {m.minutes / 60}h · {m.code}</span>
              </li>)}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/instrutor/disponibilidade" variant="ghost">Configurar dias e turnos</ButtonLink>
            <ButtonLink href="/instrutor/pontos" variant="ghost">Definir pontos de encontro</ButtonLink>
          </div>
        </Card>
        <Card>
          <h2 className="text-[18px] font-bold">Bloquear um período</h2>
          {blocks.error ? (
            <Note tone="warning" className="mt-3">Execute a migração de disponibilidade para ativar os bloqueios reais.</Note>
          ) : (
            <>
              <ActionForm action={blockInstructorTime} submitLabel="Bloquear horário" className="mt-4 grid gap-3">
                <Field label="Início"><input type="datetime-local" name="start" required className={inputClass}/></Field>
                <Field label="Término"><input type="datetime-local" name="end" required className={inputClass}/></Field>
                <Field label="Motivo (opcional)"><input type="text" name="reason" maxLength={160} className={inputClass} placeholder="Ex.: folga ou manutenção"/></Field>
              </ActionForm>
              <h3 className="mt-5 text-[15px] font-semibold">Bloqueios ativos</h3>
              {(blocks.data ?? []).length === 0 ? <p className="mt-2 text-[13px] text-muted">Nenhum horário bloqueado.</p> : (
                <ul className="mt-2 divide-y divide-line">
                  {(blocks.data ?? []).map(x => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <span className="text-[12px] text-muted">
                        <strong className="block text-ink">{formatDateLong(x.starts_at)} · {formatTime(x.starts_at)}</strong>
                        Até {formatDateLong(x.ends_at)} · {formatTime(x.ends_at)} {x.reason ? '· ' + x.reason : ''}
                      </span>
                      <ActionForm action={unblockInstructorTime} submitLabel="Remover" submitVariant="ghost" className="flex flex-wrap gap-2 items-center">
                        <input type="hidden" name="blockId" value={x.id}/>
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
