'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

const Start = z.strictObject({ meetingId: z.uuid(), presenceCode: z.string().regex(/^\d{4}$/) });

export async function startMeeting(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const parsed = Start.safeParse({ meetingId: form.get('meetingId'), presenceCode: form.get('presenceCode') });
  if (!parsed.success) return { error: 'Informe o código de 4 dígitos.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('start_ordered_meeting', {
    p_meeting_id: parsed.data.meetingId,
    p_presence_code: parsed.data.presenceCode,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/instrutor/aula');
  return { ok: 'Presença confirmada. Bom vento!' };
}

const Record = z.strictObject({
  meetingId: z.uuid(),
  doneMinutes: z.coerce.number().int().min(0).max(480),
  note: z.string().max(1000),
});

export async function recordMeeting(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const parsed = Record.safeParse({
    meetingId: form.get('meetingId'),
    doneMinutes: form.get('doneMinutes'),
    note: form.get('note') ?? '',
  });
  if (!parsed.success) return { error: 'Confira os minutos realizados.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('record_meeting', {
    p_meeting_id: parsed.data.meetingId,
    p_done_minutes: parsed.data.doneMinutes,
    p_note: parsed.data.note,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/instrutor/aula');
  revalidatePath('/instrutor/hoje');
  return { ok: 'Aula registrada. O aluno já vê o registro.' };
}

const Profile = z.strictObject({
  years: z.coerce.number().int().min(0).max(60),
  beachIds: z.array(z.uuid()).max(20),
  languages: z.array(z.enum(['Português', 'Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano'])).min(1).max(6),
  hasEquipment: z.boolean(),
  hasSupportVehicle: z.boolean(),
});

/** Updates only the columns an instructor may edit (column grants enforce it). */
export async function updateInstructorProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['instructor']);
  const parsed = Profile.safeParse({
    years: form.get('years'),
    beachIds: form.getAll('beachIds'),
    languages: form.getAll('languages'),
    hasEquipment: form.get('hasEquipment') === 'on',
    hasSupportVehicle: form.get('hasSupportVehicle') === 'on',
  });
  if (!parsed.success) return { error: 'Escolha ao menos um idioma e confira os anos de experiência.' };

  const supabase = await createSupabaseServerClient();
  const basicFields = {
    years_experience: parsed.data.years,
    languages: parsed.data.languages,
    has_equipment: parsed.data.hasEquipment,
  };
  let { error } = await supabase.from('instructors')
    .update({ ...basicFields, has_support_vehicle: parsed.data.hasSupportVehicle })
    .eq('id', viewer.id);
  // When support-vehicle migration is pending, save all the existing fields.
  // Never pretend the optional vehicle preference was saved if it wasn't.
  let transportUnavailable = false;
  if (error && (error.code === '42703' || error.code === 'PGRST204') && /has_support_vehicle/i.test(error.message)) {
    transportUnavailable = true;
    const retry = await supabase.from('instructors').update(basicFields).eq('id', viewer.id);
    error = retry.error;
  }
  if (error) return { error: friendlyError(error) };

  // Beaches go through set_my_beaches, which accepts only beaches the
  // operation created and keeps the list to the caller's own row.
  const { error: beachError } = await supabase.rpc('set_my_beaches', { p_beach_ids: parsed.data.beachIds });
  if (beachError) return { error: friendlyError(beachError) };
  revalidatePath('/instrutor/cadastro');
  return { ok: transportUnavailable
    ? 'Perfil salvo. A opção de veículo de apoio ainda depende da atualização do banco.'
    : 'Perfil salvo. A operação analisa seu cadastro antes de liberar pedidos.' };
}


/**
 * Record the minutes plus the six kite stages as one atomic DB operation.
 * A stage can be practised or mastered. Nothing is unlocked for the student
 * before the instructor closes the meeting.
 */
export async function recordMeetingWithSkills(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['instructor']);
  const parsed = z.strictObject({
    meetingId: z.uuid(),
    doneMinutes: z.coerce.number().int().min(0).max(480),
  }).safeParse({
    meetingId: form.get('meetingId'),
    doneMinutes: form.get('doneMinutes'),
  });
  if (!parsed.success) return { error: 'Confira os minutos realizados.' };

  const practiced: number[] = [];
  const mastered: number[] = [];
  for (let step = 1; step <= 6; step++) {
    const value = form.get('step' + step);
    if (value !== 'none' && value !== 'practiced' && value !== 'mastered') {
      return { error: 'Confira a evolução de cada etapa do kite.' };
    }
    if (value === 'practiced') practiced.push(step);
    if (value === 'mastered') mastered.push(step);
  }
  if (parsed.data.doneMinutes > 0 && practiced.length + mastered.length === 0) {
    return { error: 'Marque pelo menos uma etapa trabalhada nesta aula.' };
  }
  if (parsed.data.doneMinutes === 0 && practiced.length + mastered.length > 0) {
    return { error: 'Não é possível registrar etapas com zero minutos realizados.' };
  }

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('record_meeting_with_skills', {
    p_meeting_id: parsed.data.meetingId,
    p_done_minutes: parsed.data.doneMinutes,
    p_practiced_steps: practiced,
    p_mastered_steps: mastered,
  });
  if (error) {
    console.error('[instructor.meeting.skills]', { code: error.code, message: error.message });
    return { error: friendlyError(error) };
  }
  revalidatePath('/instrutor/aula');
  revalidatePath('/instrutor/hoje');
  revalidatePath('/aluno/evolucao');
  revalidatePath('/aluno/aulas');
  return { ok: 'Encontro registrado! As etapas trabalhadas já aparecem na evolução do aluno.' };
}
