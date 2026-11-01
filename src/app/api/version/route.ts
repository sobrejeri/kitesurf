import { NextResponse } from 'next/server';

/**
 * Runtime-only deployment marker. Avoid caching this response: an open iPhone
 * app compares it with the bundle that was originally loaded.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  // Render deploy marker is server-only; this route never exposes a secret.
  // eslint-disable-next-line no-restricted-syntax
  const id = process.env.RENDER_GIT_COMMIT
    ?? process.env.NEXT_PUBLIC_BUILD_ID
    ?? 'dev';

  return NextResponse.json({ id }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}
