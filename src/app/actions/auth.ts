'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { ROLE_HOME, type AppRole } from '@/lib/auth';
import { SITE_URL } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

const SignIn = z.strictObject({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(200).optional(),
});

/** Only same-site paths may be used as a post-login destination. */
function safeNext(next: string | undefined): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = SignIn.safeParse({
    email: form.get('email'),
    password: form.get('password'),
    next: form.get('next') || undefined,
  });
  if (!parsed.success) return { error: 'Informe e-mail e senha válidos.' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: friendlyError(error) };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single<{ role: AppRole }>();
  redirect(safeNext(parsed.data.next) ?? ROLE_HOME[profile?.role ?? 'student']);
}

const SignUp = z.strictObject({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  password: z.string().min(8).max(200),
  // Admin is not on this list on purpose: it is never self-assigned.
  role: z.enum(['student', 'instructor', 'partner']),
});

export async function signUp(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = SignUp.safeParse({
    fullName: form.get('fullName'),
    email: form.get('email'),
    password: form.get('password'),
    role: form.get('role'),
  });
  if (!parsed.success) return { error: 'Confira nome, e-mail e uma senha de pelo menos 8 caracteres.' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, role: parsed.data.role },
      emailRedirectTo: `${SITE_URL}/auth/confirm`,
    },
  });
  if (error) return { error: friendlyError(error) };

  // With e-mail confirmation on (the Supabase default) there is no session yet.
  if (!data.session) return { ok: 'Conta criada. Enviamos um link de confirmação para o seu e-mail.' };
  redirect(ROLE_HOME[parsed.data.role]);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/entrar');
}
