'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { APP_AREAS, AREA_LIST, areaForRole, safeNextFor, type AppArea } from '@/lib/app-areas';
import { type AppRole } from '@/lib/auth';
import { SITE_URL } from '@/lib/env';
import { createSupabaseServerClient, currentArea } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

const Area = z.enum(AREA_LIST as [AppArea, ...AppArea[]]);

const SignIn = z.strictObject({
  area: Area,
  email: z.email().max(200),
  password: z.string().min(1).max(200),
  next: z.string().max(200).optional(),
});

const ROLE_WORD: Readonly<Record<AppRole, string>> = {
  student: 'aluno',
  instructor: 'instrutor',
  admin: 'administrador',
  partner: 'pousada',
};

/**
 * Signs in to one app. The session goes to that app's own cookie, and only
 * an account of that app's kind (or an admin) is accepted — a student cannot
 * end up signed in inside "Vento Admin".
 */
export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = SignIn.safeParse({
    area: form.get('area'),
    email: form.get('email'),
    password: form.get('password'),
    next: form.get('next') || undefined,
  });
  if (!parsed.success) return { error: 'Informe e-mail e senha válidos.' };
  const { area } = parsed.data;

  const supabase = await createSupabaseServerClient(area);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: friendlyError(error) };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single<{ role: AppRole }>();
  const role = profile?.role ?? 'student';
  if (role !== APP_AREAS[area].role && role !== 'admin') {
    await supabase.auth.signOut({ scope: 'local' });
    const right = APP_AREAS[areaForRole(role)];
    return { error: `Esta é uma conta de ${ROLE_WORD[role]}. Entre pelo app ${right.appName}.` };
  }

  redirect(safeNextFor(area, parsed.data.next) ?? APP_AREAS[area].home);
}

const SignUp = z.strictObject({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  password: z.string().min(8).max(200),
  // Admin is not on this list on purpose: it is never self-assigned.
  role: z.enum(['student', 'instructor', 'partner']),
  kiteLevel: z.enum(['first_time', 'returning', 'improving']).optional(),
});

export async function signUp(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = SignUp.safeParse({
    fullName: form.get('fullName'),
    email: form.get('email'),
    password: form.get('password'),
    role: form.get('role'),
    kiteLevel: form.get('kiteLevel') || undefined,
  });
  if (!parsed.success) return { error: 'Confira nome, e-mail, senha e nível de kitesurf.' };
  if (parsed.data.role === 'student' && !parsed.data.kiteLevel) {
    return { error: 'Escolha seu nível no kitesurf para criar a conta.' };
  }
  const area = areaForRole(parsed.data.role);

  const supabase = await createSupabaseServerClient(area);
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName, role: parsed.data.role,
        ...(parsed.data.role === 'student' ? { kite_level: parsed.data.kiteLevel } : {}),
      },
      // The confirmation link signs the user in to the app they signed up in.
      emailRedirectTo: `${SITE_URL}/auth/confirm?area=${area}`,
    },
  });
  if (error) return { error: friendlyError(error) };

  // With e-mail confirmation on (the Supabase default) there is no session yet.
  if (!data.session) return { ok: 'Conta criada. Enviamos um link de confirmação para o seu e-mail.' };
  redirect(APP_AREAS[area].home);
}

/** Signs out of the current app only; the other apps keep their sessions. */
export async function signOut(): Promise<void> {
  const area = await currentArea();
  const supabase = await createSupabaseServerClient(area);
  await supabase.auth.signOut({ scope: 'local' });
  redirect(`/${area}/entrar`);
}
