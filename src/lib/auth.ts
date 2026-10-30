import 'server-only';

import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { cache } from 'react';

import { APP_AREAS, loginPath } from './app-areas';
import { supabaseConfig } from './env';
import { createSupabaseServerClient, currentArea } from './supabase/server';

export type AppRole = 'student' | 'instructor' | 'admin' | 'partner';

export interface Viewer {
  id: string;
  email: string | null;
  role: AppRole;
  fullName: string;
  language: string;
}

export const ROLE_HOME: Readonly<Record<AppRole, string>> = {
  student: '/aluno/aulas',
  instructor: '/instrutor/hoje',
  admin: '/admin/visao',
  partner: '/pousada/inicio',
};

/** The signed-in user and their profile, once per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Who is looking is only known per request; never prerender around it, even
  // when the build runs without Supabase variables.
  await connection();
  if (!supabaseConfig) return null;
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, language')
    .eq('id', userId)
    .single<{ role: AppRole; full_name: string; language: string }>();
  if (!profile) return null;

  return {
    id: userId,
    email: typeof claims.claims.email === 'string' ? claims.claims.email : null,
    role: profile.role,
    fullName: profile.full_name,
    language: profile.language,
  };
});

/**
 * Role check for a page or action. Admins pass every check, so the operation
 * team can open any area; everyone else must hold one of the listed roles.
 * The database repeats the check — this only decides what to render.
 */
export async function requireRole(roles: readonly AppRole[], next?: string): Promise<Viewer> {
  await connection();
  if (!supabaseConfig) redirect('/configuracao');
  const viewer = await getViewer();
  const area = await currentArea();
  if (!viewer) redirect(loginPath(area, next));
  // Each app has its own session, so a wrong role here means someone signed
  // in to this app with another kind of account: back to its login.
  if (viewer.role !== 'admin' && !roles.includes(viewer.role)) {
    redirect(viewer.role === APP_AREAS[area].role ? ROLE_HOME[viewer.role] : `/${area}/entrar?erro=conta`);
  }
  return viewer;
}
