'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const Draft = z.strictObject({
  hours: z.coerce.number().int().min(0).max(720),
  late: z.string().trim().max(5000),
  absence: z.string().trim().max(5000),
  weather: z.string().trim().max(5000),
});

export async function saveCommercialDraft(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['admin']);
  const parsed = Draft.safeParse({ hours: form.get('hours'), late: form.get('late'), absence: form.get('absence'), weather: form.get('weather') });
  if (!parsed.success) return { error: 'Confira o prazo (0 a 720 horas) e os textos (até 5.000 caracteres).' };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc('save_commercial_policy_draft', {
    p_cancellation_hours: parsed.data.hours, p_late_cancellation: parsed.data.late,
    p_absence: parsed.data.absence, p_weather: parsed.data.weather,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin/politicas');
  return { ok: 'Rascunho salvo. As regras vigentes de cancelamento permanecem inalteradas.' };
}
