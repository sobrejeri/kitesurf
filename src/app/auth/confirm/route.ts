import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { areaFromParam } from '@/lib/app-areas';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Target of the confirmation e-mail. The Supabase "Confirm signup" template
 * must point here: {{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email
 * (RedirectTo already carries ?area=…), or {{ .SiteURL }}/auth/confirm?…
 * for accounts created before the per-app logins.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const requested = params.get('area');
  const area = areaFromParam(requested) ?? 'aluno';

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient(area);
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(`/${area}/entrar?confirmado=1`, request.url));
  }
  return NextResponse.redirect(new URL(`/${area}/entrar`, request.url));
}
