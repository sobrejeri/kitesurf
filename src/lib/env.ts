/**
 * Public configuration. Both values are safe in a browser bundle: the anon key
 * only grants what row level security allows. No server secret is used
 * anywhere in this app — every privileged operation is a database function.
 *
 * Next inlines NEXT_PUBLIC_* at build time, so they must be set before
 * `next build` (on Render: as environment variables of the service).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfig = url && anonKey ? { url, anonKey } : null;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY não estão definidos.');
    this.name = 'SupabaseNotConfiguredError';
  }
}

export function requireSupabaseConfig() {
  if (!supabaseConfig) throw new SupabaseNotConfiguredError();
  return supabaseConfig;
}
