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

// Render does not guarantee NEXT_PUBLIC_SITE_URL is set. In a production build,
// never send account confirmation or recovery links to localhost when it is absent.
// An explicit URL still takes precedence for preview/staging deployments.
// NODE_ENV is set and inlined by Next.js itself; it is not a secret.
// eslint-disable-next-line no-restricted-syntax
const productionBuild = process.env.NODE_ENV === 'production';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ||
  (productionBuild ? 'https://vento-kitesurf.onrender.com' : 'http://localhost:3000');

/**
 * Absolute address on the public site, for redirects from route handlers.
 * Never build them from `request.url`: behind Render's proxy it carries the
 * internal server address (https://localhost:10000), and the browser would be
 * sent to a page that does not open. The e-mail links already use SITE_URL.
 */
export function siteUrl(path: string): URL {
  // Only local absolute paths may be used for authentication redirects.
  // URL() otherwise accepts protocol-relative (//host) and full external URLs.
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)) {
    throw new Error('Invalid local redirect path');
  }
  const destination = new URL(path, SITE_URL);
  if (destination.origin !== new URL(SITE_URL).origin) {
    throw new Error('Cross-origin redirect blocked');
  }
  return destination;
}

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
