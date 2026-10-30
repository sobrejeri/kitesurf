'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

const Profile = z.strictObject({
  fullName: z.string().trim().min(2).max(120),
  language: z.enum(['Português', 'Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano']),
});

/**
 * Name and language only: column grants on profiles allow nothing else, so
 * even a crafted request cannot touch the role.
 */
export async function updateProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['student', 'instructor', 'partner']);
  const parsed = Profile.safeParse({ fullName: form.get('fullName'), language: form.get('language') });
  if (!parsed.success) return { error: 'Informe um nome com pelo menos 2 letras.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName, language: parsed.data.language })
    .eq('id', viewer.id);
  if (error) return { error: friendlyError(error) };

  revalidatePath('/', 'layout');
  return { ok: 'Perfil atualizado.' };
}
