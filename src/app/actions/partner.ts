'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

const RegisterPartner = z.strictObject({
  name: z.string().trim().min(2).max(120),
  beachId: z.uuid(),
});

export async function registerPartner(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireRole(['partner']);
  const parsed = RegisterPartner.safeParse({ name: form.get('name'), beachId: form.get('beachId') });
  if (!parsed.success) return { error: 'Informe o nome da pousada e a praia.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('register_partner', { p_name: parsed.data.name, p_beach_id: parsed.data.beachId });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/pousada/inicio');
  return { ok: 'Pousada cadastrada. A operação aprova antes de liberar o link.' };
}
