import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { requireSupabaseConfig } from '../env';

/**
 * Supabase client for server components, server actions and route handlers.
 * It acts as the signed-in user, so every query is filtered by RLS.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
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
