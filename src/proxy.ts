import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { supabaseConfig } from '@/lib/env';

/**
 * Runs before every page. It refreshes the Supabase session cookie and sends
 * signed-out visitors of private areas to the sign-in page.
 *
 * This is the first gate, not the only one: each page checks the role again on
 * the server (requireRole) and the database enforces RLS on every row.
 */

const PUBLIC_PATHS = ['/', '/entrar', '/cadastro', '/auth', '/aluno/inicio', '/aluno/politicas', '/configuracao'];
const REFERRAL_COOKIE = 'vento_ref';
const REFERRAL_PATTERN = /^[A-Z0-9-]{3,32}$/;

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`)));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // A partner inn's link: /aluno/inicio?ref=CODE. Remembered for 30 days and
  // read on the server when the booking is created.
  const ref = request.nextUrl.searchParams.get('ref')?.toUpperCase();
  const rememberReferral = (res: NextResponse) => {
    if (ref && REFERRAL_PATTERN.test(ref)) {
      res.cookies.set(REFERRAL_COOKIE, ref, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, path: '/' });
    }
    return res;
  };

  if (!supabaseConfig) {
    if (isPublic(request.nextUrl.pathname)) return rememberReferral(response);
    return NextResponse.redirect(new URL('/configuracao', request.url));
  }

  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getClaims validates the JWT; do not put code between client creation and
  // this call, or sessions can be dropped at random.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = '';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return rememberReferral(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
