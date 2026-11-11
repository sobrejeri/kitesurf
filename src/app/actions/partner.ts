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
  if (!parsed.success) return { error: 'Informe seu nome (ou da sua empresa) e a praia onde você atua.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('register_partner', { p_name: parsed.data.name, p_beach_id: parsed.data.beachId });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/afiliado/inicio');
  revalidatePath('/afiliado/cadastro');
  revalidatePath('/afiliado/perfil');
  return { ok: 'Cadastro criado! Abra Meu perfil e complete responsável, telefone, cidade e endereço para a análise.' };
}
