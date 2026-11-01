'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Schedule = z.strictObject({
  days: z.array(z.coerce.number().int().min(0).max(6)).max(7),
  opens: Time, closes: Time, buffer: z.coerce.number().int().min(0).max(120),
});

export async function saveInstructorSchedule(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const parsed = Schedule.safeParse({
    days: form.getAll('days'), opens: form.get('opens'),
    closes: form.get('closes'), buffer: form.get('buffer'),
  });
  if (!parsed.success || parsed.data.opens >= parsed.data.closes) {
    return { error: 'Confira os dias, o horário inicial e final e o intervalo.' };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('save_my_schedule', {
    p_days: parsed.data.days,
    p_opens_at: parsed.data.opens,
    p_closes_at: parsed.data.closes,
    p_buffer_minutes: parsed.data.buffer,
  });
  if (error) {
    console.error('[schedule.save]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  revalidatePath('/instrutor/disponibilidade');
  revalidatePath('/instrutor/agenda');
  return { ok: 'Disponibilidade salva. Novas reservas respeitarão seus turnos.' };
}

const TimeBlock = z.strictObject({
  start: z.iso.datetime({ local: true, precision: -1 }),
  end: z.iso.datetime({ local: true, precision: -1 }),
  reason: z.string().max(160),
});

/** Times entered on the Preá/Jericoacoara calendar are UTC−03:00 year-round. */
export async function blockInstructorTime(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const parsed = TimeBlock.safeParse({
    start: form.get('start'), end: form.get('end'), reason: form.get('reason') ?? '',
  });
  if (!parsed.success) return { error: 'Informe datas e horários válidos para o bloqueio.' };
  const start = parsed.data.start + ':00-03:00';
  const end = parsed.data.end + ':00-03:00';
  if (Date.parse(end) <= Date.parse(start) || Date.parse(start) < Date.now()) {
    return { error: 'O bloqueio deve ser no futuro, com término após o início.' };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('block_my_time', {
    p_start: start, p_end: end, p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/instrutor/agenda');
  revalidatePath('/instrutor/disponibilidade');
  return { ok: 'Horário bloqueado para novas solicitações.' };
}

export async function unblockInstructorTime(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const id = z.uuid().safeParse(form.get('blockId'));
  if (!id.success) return { error: 'Bloqueio inválido.' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('unblock_my_time', { p_id: id.data });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/instrutor/agenda');
  return { ok: 'Bloqueio removido.' };
}
