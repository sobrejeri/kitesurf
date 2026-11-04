import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { AREA_HEADER, areaFromPath, loginPath, sessionCookieName } from '@/lib/app-areas';
import { supabaseConfig } from '@/lib/env';

/**
 * Runs before every page. It works out which of the four apps the URL belongs
 * to, refreshes that app's own session cookie, tells server code the app via
 * a request header, and sends signed-out visitors to that app's login.
 *
 * This is the first gate, not the only one: each page checks the role again on
 * the server (requireRole) and the database enforces RLS on every row.
 */

const PUBLIC_PATHS = ['/', '/entrar', '/cadastro', '/auth', '/api/version', '/aluno/inicio', '/aluno/politicas', '/configuracao'];
const REFERRAL_COOKIE = 'vento_ref';
const REFERRAL_PATTERN = /^[A-Z0-9-]{3,32}$/;

function isPublic(pathname: string): boolean {
  if (/^\/(aluno|instrutor|admin|pousada)\/(entrar|criar-conta|recuperar|redefinir)(\/|$)/.test(pathname)) return true;
  return PUBLIC_PATHS.some((path) => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`)));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const area = areaFromPath(pathname);

  // Overwritten on every request, so a client cannot choose it. It only picks
  // which session cookie to read; it grants nothing.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(AREA_HEADER, area);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  let response = next();

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
    if (isPublic(pathname)) return rememberReferral(response);
    return NextResponse.redirect(new URL('/configuracao', request.url));
  }

  const supabase = createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
    cookieOptions: { name: sessionCookieName(area) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getClaims validates the JWT; do not put code between client creation and
  // this call, or sessions can be dropped at random.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublic(pathname)) {
    return NextResponse.redirect(new URL(loginPath(area, pathname), request.url));
  }

  return rememberReferral(response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|apps/|images/|version.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
};
