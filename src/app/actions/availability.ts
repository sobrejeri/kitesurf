'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { isDayKey, parseScheduleForm, toRpcDays, wholeDaysToRange } from '@/lib/instructor-agenda';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const AREAS = ['/instrutor/disponibilidade', '/instrutor/agenda'] as const;
const refresh = () => AREAS.forEach((path) => revalidatePath(path));

/** What a save/time-off RPC reports back: offers returned to the queue and confirmed classes now outside the schedule. */
const Impact = z.object({ offers_advanced: z.number().int(), conflicting_meetings: z.number().int() }).partial();
function impactNote(data: unknown): string {
  const impact = Impact.safeParse(data);
  if (!impact.success) return '';
  const parts: string[] = [];
  if ((impact.data.offers_advanced ?? 0) > 0) parts.push(`${impact.data.offers_advanced} solicitação(ões) em aberto passaram para o próximo instrutor`);
  if ((impact.data.conflicting_meetings ?? 0) > 0) {
    parts.push(`${impact.data.conflicting_meetings} aula(s) confirmada(s) ficaram fora do horário e continuam marcadas: combine o reagendamento pela aula`);
  }
  return parts.length ? ` Atenção: ${parts.join('; ')}.` : '';
}

/**
 * Weekly schedule: a different shift per weekday, up to three breaks per day and the buffer between lessons.
 * The browser sends choices only; the database validates them again and applies the schedule atomically.
 */
export async function saveInstructorSchedule(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const parsed = parseScheduleForm((name) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : null;
  });
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('save_my_weekly_schedule', {
    p_days: toRpcDays(parsed.days),
    p_buffer_minutes: parsed.buffer,
  });
  if (error) {
    console.error('[schedule.save]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  refresh();
  return { ok: `Disponibilidade salva. Novas reservas respeitam seus turnos.${impactNote(data)}` };
}

const Block = z.strictObject({
  kind: z.literal('block'),
  start: z.iso.datetime({ local: true, precision: -1 }),
  end: z.iso.datetime({ local: true, precision: -1 }),
  reason: z.string().max(160),
});
const WholeDays = z.strictObject({
  kind: z.enum(['day_off', 'vacation']),
  firstDay: z.string(), lastDay: z.string(),
  reason: z.string().max(160),
});

/**
 * Block, day off or vacation. Times typed on the Preá/Jericoacoara calendar are UTC−03:00 year-round; day off and
 * vacation are whole local days. Classes already confirmed or awaiting payment are never overwritten (the database refuses).
 */
export async function blockInstructorTime(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const kind = form.get('kind') ?? 'block';
  const reason = String(form.get('reason') ?? '').trim();
  let p_start: string;
  let p_end: string;
  if (kind === 'block') {
    const parsed = Block.safeParse({ kind, start: form.get('start'), end: form.get('end'), reason });
    if (!parsed.success) return { error: 'Informe datas e horários válidos para o bloqueio.' };
    p_start = `${parsed.data.start}:00-03:00`;
    p_end = `${parsed.data.end}:00-03:00`;
    if (Date.parse(p_end) <= Date.parse(p_start) || Date.parse(p_start) < Date.now()) {
      return { error: 'O bloqueio deve ser no futuro, com término após o início.' };
    }
  } else {
    const parsed = WholeDays.safeParse({ kind, firstDay: form.get('firstDay'), lastDay: form.get('lastDay'), reason });
    if (!parsed.success) return { error: 'Escolha se é folga ou férias e informe o primeiro e o último dia.' };
    if (!isDayKey(parsed.data.firstDay) || !isDayKey(parsed.data.lastDay)) return { error: 'Informe datas válidas.' };
    const range = wholeDaysToRange(parsed.data.firstDay, parsed.data.lastDay);
    if (!range) return { error: 'O último dia não pode ser antes do primeiro.' };
    p_start = range.start;
    p_end = range.end;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('add_my_time_off', { p_start, p_end, p_kind: String(kind), p_reason: reason });
  if (error) {
    console.error('[schedule.block]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  refresh();
  return { ok: kind === 'vacation' ? 'Férias registradas. Nenhuma nova reserva cairá nesse período.' : kind === 'day_off' ? 'Folga registrada.' : 'Horário bloqueado para novas solicitações.' };
}

export async function unblockInstructorTime(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const id = z.uuid().safeParse(form.get('blockId'));
  if (!id.success) return { error: 'Bloqueio inválido.' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('unblock_my_time', { p_id: id.data });
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: 'Bloqueio removido.' };
}

const Extra = z.strictObject({
  day: z.string(),
  opens: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closes: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

/** Opens an extra window on one date outside the weekly shift (still subject to time off and other classes). */
export async function addInstructorExtraHours(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const parsed = Extra.safeParse({ day: form.get('day'), opens: form.get('opens'), closes: form.get('closes') });
  if (!parsed.success || !isDayKey(parsed.data.day) || parsed.data.opens >= parsed.data.closes) {
    return { error: 'Informe a data e um horário inicial antes do final.' };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('add_my_extra_hours', {
    p_day: parsed.data.day, p_opens: parsed.data.opens, p_closes: parsed.data.closes,
  });
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: 'Horário extra salvo para esse dia.' };
}

export async function removeInstructorExtraHours(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const id = z.uuid().safeParse(form.get('extraId'));
  if (!id.success) return { error: 'Horário extra inválido.' };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('remove_my_extra_hours', { p_id: id.data });
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: `Horário extra removido.${impactNote(data)}` };
}
