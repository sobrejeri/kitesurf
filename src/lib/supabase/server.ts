import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

import { AREA_HEADER, isArea, sessionCookieName, type AppArea } from '../app-areas';
import { requireSupabaseConfig } from '../env';

/** The app this request belongs to, as set by the proxy from the URL. */
export async function currentArea(): Promise<AppArea> {
  const value = (await headers()).get(AREA_HEADER);
  return isArea(value) ? value : 'aluno';
}

/**
 * Supabase client for server components, server actions and route handlers.
 * It acts as the signed-in user of the current app (each app keeps its own
 * session cookie), so every query is filtered by RLS.
 */
export async function createSupabaseServerClient(area?: AppArea) {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();
  const app = area ?? (await currentArea());

  return createServerClient(url, anonKey, {
    cookieOptions: { name: sessionCookieName(app) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server components cannot set cookies. The proxy refreshes the
          // session on every request, so a missed write here is harmless.
        }
      },
    },
  });
}
