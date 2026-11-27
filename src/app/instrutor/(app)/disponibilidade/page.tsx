import type { Metadata } from 'next';

import { addInstructorExtraHours, removeInstructorExtraHours, saveInstructorSchedule } from '@/app/actions/availability';
import { ActionForm } from '@/components/action-form';
import { ButtonLink, Card, Field, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { formatDateLong, formatTime } from '@/lib/format';
import { MAX_BREAKS_PER_DAY, WEEKDAY_NAMES, hhmm, localDayKey, shiftSummary, type DayShift } from '@/lib/instructor-agenda';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dias e turnos' };

type Setting = { buffer_minutes: number };
type Shift = { weekday: number; opens_at: string; closes_at: string };
type Pause = { weekday: number; starts_at: string; ends_at: string };
type Extra = { id: string; day: string; opens_at: string; closes_at: string };
type Conflict = { meeting_id: string; booking_code: string; starts_at: string; minutes: number };

const DEFAULT_DAYS = new Set([1, 2, 3, 4, 5, 6]);

export default async function AvailabilityPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/disponibilidade');
  const db = await createSupabaseServerClient();
  const today = localDayKey(Date.now());
  const [settings, shifts, pauses, extras, conflicts] = await Promise.all([
    db.from('instructor_schedule_settings').select('buffer_minutes').eq('instructor_id', viewer.id).maybeSingle<Setting>(),
    db.from('instructor_weekly_hours').select('weekday,opens_at,closes_at').eq('instructor_id', viewer.id).returns<Shift[]>(),
    db.from('instructor_weekly_breaks').select('weekday,starts_at,ends_at').eq('instructor_id', viewer.id).order('starts_at').returns<Pause[]>(),
    db.from('instructor_extra_hours').select('id,day,opens_at,closes_at').eq('instructor_id', viewer.id).gte('day', today).order('day').returns<Extra[]>(),
    db.rpc('list_my_schedule_conflicts'),
  ]);
  const ready = !settings.error && !shifts.error;
  const v2 = ready && !pauses.error && !extras.error;
  const configured = Boolean(settings.data);
  const conflictRows: Conflict[] = Array.isArray(conflicts.data) ? (conflicts.data as Conflict[]) : [];

  const byDay = new Map<number, DayShift>();
  for (const shift of shifts.data ?? []) {
    byDay.set(shift.weekday, { weekday: shift.weekday, opens: hhmm(shift.opens_at), closes: hhmm(shift.closes_at), breaks: [] });
  }
  for (const pause of pauses.data ?? []) byDay.get(pause.weekday)?.breaks.push({ from: hhmm(pause.starts_at), to: hhmm(pause.ends_at) });
  const fallback = [...byDay.values()][0];

  return (
    <>
      <PageHeader eyebrow="Sua disponibilidade" title="Dias e turnos"
        lead="A busca de instrutores, a fila e os reagendamentos respeitam os dias, turnos, pausas e bloqueios registrados aqui." />
      {!v2 ? (
        <Note tone="warning">A edição da disponibilidade está temporariamente indisponível. Consulte sua agenda e tente novamente mais tarde.</Note>
      ) : (
        <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4">
          {conflictRows.length > 0 ? (
            <Note tone="warning" icon="info">
              <strong className="block">{conflictRows.length} aula(s) confirmada(s) estão fora do seu horário atual.</strong>
              Elas continuam marcadas; nada é apagado nem movido. Combine o reagendamento com o aluno pela página da aula:
              {' '}{conflictRows.slice(0, 4).map((item) => `${item.booking_code} (${formatDateLong(item.starts_at)} ${formatTime(item.starts_at)})`).join(', ')}
              {conflictRows.length > 4 ? ' e outras.' : '.'}
            </Note>
          ) : null}
          <Card>
            {!configured && <Note tone="warning" className="mb-4">Configure seus turnos para que as novas reservas respeitem sua rotina. Até salvar, a regra anterior continua ativa.</Note>}
            <ActionForm action={saveInstructorSchedule} submitLabel="Salvar minha disponibilidade" className="grid gap-4">
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-[14px] font-semibold text-ink">Turno de cada dia</legend>
                <p className="text-[12px] text-muted">Marque os dias em que atende e ajuste o horário de cada um. Desmarque todos para suspender novas reservas sem apagar sua conta.</p>
                {WEEKDAY_NAMES.map((name, weekday) => {
                  const current = byDay.get(weekday);
                  const on = configured ? Boolean(current) : DEFAULT_DAYS.has(weekday);
                  const base = current ?? fallback ?? { weekday, opens: '08:00', closes: '17:00', breaks: [] };
                  return (
                    <div key={name} className="rounded-2xl border border-line p-3">
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px] font-semibold text-ink">
                        <input type="checkbox" name={`d${weekday}`} value="on" defaultChecked={on} className="h-5 w-5 accent-orange-500" />
                        {name}
                        {current ? <span className="ml-auto text-[12px] font-normal text-muted">{shiftSummary(current)}</span> : null}
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <Field label="Início"><input type="time" name={`d${weekday}_opens`} defaultValue={base.opens} className={inputClass} /></Field>
                        <Field label="Fim"><input type="time" name={`d${weekday}_closes`} defaultValue={base.closes} className={inputClass} /></Field>
                      </div>
                      {v2 ? (
                        <details className="mt-2" open={Boolean(current?.breaks.length)}>
                          <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-medium text-brand">Pausas do dia (almoço, descanso)</summary>
                          <div className="mt-1 grid gap-2">
                            {Array.from({ length: MAX_BREAKS_PER_DAY }, (_, index) => {
                              const pause = current?.breaks[index];
                              return (
                                <div key={index} className="grid grid-cols-2 gap-3">
                                  <Field label={`Pausa ${index + 1}: de`}><input type="time" name={`d${weekday}_b${index}_from`} defaultValue={pause?.from ?? ''} className={inputClass} /></Field>
                                  <Field label="até"><input type="time" name={`d${weekday}_b${index}_to`} defaultValue={pause?.to ?? ''} className={inputClass} /></Field>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </fieldset>
              <Field label="Intervalo entre aulas (minutos)" hint="Tempo livre antes e depois de cada aula confirmada.">
                <input type="number" name="buffer" min="0" max="120" step="5" defaultValue={settings.data?.buffer_minutes ?? 30} required inputMode="numeric" className={inputClass} />
              </Field>
              <Note>Os turnos usam o horário de Preá e Jericoacoara (UTC−3). Mudanças valem para novos pedidos; aulas confirmadas não são apagadas, e solicitações em aberto que não cabem mais passam para o próximo instrutor.</Note>
            </ActionForm>
          </Card>

          {v2 && configured ? (
            <Card>
              <h2 className="text-[16px] font-bold text-ink">Horário extra em uma data</h2>
              <p className="mt-1 text-[12px] text-muted">Abra uma janela em um dia fora do seu turno (por exemplo, um sábado de vento forte). Folgas e férias continuam valendo.</p>
              <ActionForm action={addInstructorExtraHours} submitLabel="Salvar horário extra" className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Data"><input type="date" name="day" min={today} required className={inputClass} /></Field>
                <Field label="Início"><input type="time" name="opens" required defaultValue="08:00" className={inputClass} /></Field>
                <Field label="Fim"><input type="time" name="closes" required defaultValue="12:00" className={inputClass} /></Field>
              </ActionForm>
              {(extras.data ?? []).length > 0 ? (
                <ul className="mt-4 divide-y divide-line">
                  {(extras.data ?? []).map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-[13px]">
                      <span><strong className="text-ink">{formatDateLong(`${item.day}T12:00:00-03:00`)}</strong> · {hhmm(item.opens_at)}–{hhmm(item.closes_at)}</span>
                      <ActionForm action={removeInstructorExtraHours} submitLabel="Remover" submitVariant="ghost">
                        <input type="hidden" name="extraId" value={item.id} />
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}
          <ButtonLink href="/instrutor/agenda" variant="ghost">Abrir agenda, folgas, férias e bloqueios</ButtonLink>
        </div>
      )}
    </>
  );
}
