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
  const { error } = await supabase.rpc('start_meeting', {
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
  beaches: z.array(z.enum(['prea', 'jeri'])).max(2),
  languages: z.array(z.enum(['Português', 'Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano'])).min(1).max(6),
  hasEquipment: z.boolean(),
});

/** Updates only the columns an instructor may edit (column grants enforce it). */
export async function updateInstructorProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['instructor']);
  const parsed = Profile.safeParse({
    years: form.get('years'),
    beaches: form.getAll('beaches'),
    languages: form.getAll('languages'),
    hasEquipment: form.get('hasEquipment') === 'on',
  });
  if (!parsed.success) return { error: 'Escolha ao menos um idioma e confira os anos de experiência.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('instructors')
    .update({
      years_experience: parsed.data.years,
      beaches: parsed.data.beaches,
      languages: parsed.data.languages,
      has_equipment: parsed.data.hasEquipment,
    })
    .eq('id', viewer.id);
  if (error) return { error: friendlyError(error) };
  revalidatePath('/instrutor/cadastro');
  return { ok: 'Perfil salvo. A operação analisa seu cadastro antes de liberar pedidos.' };
}
