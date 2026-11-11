import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// E-mail confirmation and password-reset links must bring people back to the
// public site. Behind Render's proxy, `request.url` in a route handler is the
// internal server address (https://localhost:10000), so redirects built from it
// sent the browser to a page that does not open (found live on 11/11/2026).
process.env.NEXT_PUBLIC_SITE_URL = 'https://vento-kitesurf.onrender.com';
const { siteUrl } = await import('../src/lib/env.ts');

assert.equal(siteUrl('/aluno/entrar').href, 'https://vento-kitesurf.onrender.com/aluno/entrar');
assert.equal(siteUrl('/afiliado/entrar?confirmado=1').href,
  'https://vento-kitesurf.onrender.com/afiliado/entrar?confirmado=1');
assert.equal(siteUrl('/instrutor/redefinir').origin, 'https://vento-kitesurf.onrender.com');

const read = (path) => readFileSync(path, 'utf8');
for (const route of ['src/app/auth/confirm/route.ts', 'src/app/auth/recovery/route.ts']) {
  const source = read(route);
  assert.ok(!source.includes('request.url'),
    `${route} must not build redirects from request.url (the internal address on Render)`);
  const redirects = source.match(/NextResponse\.redirect\(/g) ?? [];
  const toSite = source.match(/NextResponse\.redirect\(siteUrl\(/g) ?? [];
  assert.ok(redirects.length > 0 && toSite.length === redirects.length,
    `${route}: every redirect goes to the public site`);
  // The destination is always one of our own pages: a known area, fixed paths.
  assert.match(source, /areaFromParam\(requested\) \?\? 'aluno'/);
}

// The e-mails themselves point at the same public address.
assert.match(read('src/app/actions/auth.ts'), /emailRedirectTo: `\$\{SITE_URL\}\/auth\/confirm\?area=\$\{area\}`/);
assert.match(read('src/app/actions/password-recovery.ts'), /redirectTo: `\$\{SITE_URL\}\/auth\/recovery\?area=/);

console.log('PASS: e-mail confirmation and password links return to the public site, not the internal server address');
