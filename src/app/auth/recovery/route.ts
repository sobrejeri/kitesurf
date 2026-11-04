import { NextResponse, type NextRequest } from 'next/server';
import { isArea } from '@/lib/app-areas';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Supports the default PKCE redirect and a recovery-token email template. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requested = params.get('area');
  const area = isArea(requested) ? requested : 'aluno';
  const db = await createSupabaseServerClient(area);
  const code = params.get('code');
  const token = params.get('token_hash');
  const result = token && params.get('type') === 'recovery'
    ? await db.auth.verifyOtp({ type: 'recovery', token_hash: token })
    : code ? await db.auth.exchangeCodeForSession(code) : null;
  // Tokens are consumed by Supabase and never propagated into the next URL.
  return NextResponse.redirect(new URL(result && !result.error
    ? `/${area}/redefinir` : `/${area}/recuperar?erro=link`, request.url));
}
