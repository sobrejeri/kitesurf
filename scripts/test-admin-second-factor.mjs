import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { safeNextFor, verificationPath } from '../src/lib/app-areas.ts';

// Administrators sign in with password AND the code of an authenticator app
// (Supabase Auth MFA, TOTP). The app asks for it before any page, and the
// database refuses admin powers without it (migration 48).
const read = (path) => readFileSync(path, 'utf8');

// 1. Where the code is asked.
assert.equal(verificationPath('admin'), '/admin/verificacao');
assert.equal(verificationPath('admin', '/admin/reservas'), '/admin/verificacao?next=%2Fadmin%2Freservas');
assert.equal(safeNextFor('admin', '/admin/verificacao'), null, 'never loops back to the code screen');
assert.equal(safeNextFor('admin', '/admin/redefinir'), '/admin/redefinir', 'password reset may continue after the code');
for (const area of ['aluno', 'instrutor', 'admin', 'afiliado']) {
  const page = read(`src/app/${area}/verificacao/page.tsx`);
  assert.ok(page.includes(`<SecondFactorScreen area="${area}"`), `${area} has its own code screen (own session)`);
  assert.ok(!existsSync(`src/app/${area}/(app)/verificacao`), 'outside the signed-in layout, which would loop');
}
assert.doesNotMatch(read('src/proxy.ts'), /verificacao/, 'the code screen needs a signed-in session');
assert.match(read('src/components/shells.tsx'), /\(entrar\|criar-conta\|recuperar\|redefinir\|verificacao\)/,
  'full-screen like the other sign-in screens');

// 2. Enforced on every admin page and right after the password.
const auth = read('src/lib/auth.ts');
assert.match(auth, /secondFactor: claims\?\.claims\?\.aal === 'aal2'/, 'read from the validated token');
assert.match(auth, /if \(viewer\.role === 'admin' && !viewer\.secondFactor\) redirect\(verificationPath\(area, next\)\);/);
assert.match(read('src/app/actions/auth.ts'), /if \(role === 'admin'\) redirect\(verificationPath\(area, safeNextFor\(area, parsed\.data\.next\)\)\);/);
assert.match(read('src/app/actions/password-recovery.ts'), /error\?\.code === 'insufficient_aal'[\s\S]*redirect\(verificationPath\(parsed\.data\.area, `\/\$\{parsed\.data\.area\}\/redefinir`\)\)/,
  'an admin resetting the password confirms the code first');

// 3. Set-up and check: only for a signed-in admin, secret never logged, no external QR service.
const actions = read('src/app/actions/second-factor.ts');
assert.ok(actions.startsWith("'use server'"));
assert.match(actions, /viewer\.role !== 'admin'\) return null/, 'actions refuse anyone but an admin');
assert.match(actions, /mfa\.enroll\(\{ factorType: 'totp', issuer: 'VentoKite' \}\)/);
assert.match(actions, /mfa\.challengeAndVerify\(/);
assert.match(actions, /redirect\(safeNextFor\(session\.area, parsed\.data\.next\) \?\? APP_AREAS\[session\.area\]\.home\)/);
assert.match(actions, /code: z\.string\(\)\.trim\(\)\.regex\(\/\^\\d\{6\}\$\/\)/, 'exactly six digits');
for (const line of actions.split('\n').filter((l) => l.includes('console.'))) {
  assert.doesNotMatch(line, /secret|uri|parsed\.data\.code|form\.get/, `logs only error codes: ${line.trim()}`);
}
const forms = read('src/components/auth/second-factor-forms.tsx');
assert.ok(forms.includes("from '@/vendor/qrcodegen'") && !/https?:\/\/(?!www\.w3\.org)/.test(forms), 'QR drawn locally');
assert.ok(forms.includes('autoComplete="one-time-code"') && forms.includes('inputMode="numeric"'), 'phone keyboard and autofill');
const screen = read('src/components/auth/second-factor.tsx');
assert.match(screen, /if \(viewer\.role !== 'admin' \|\| viewer\.secondFactor\) redirect\(destination\)/, 'only admins without the code see it');

// 4. Database: admin powers need aal2 (all admin checks go through these two functions).
const migration = read('supabase/migrations/20261111150000_security_48_admin_second_factor.sql');
assert.match(migration, /select coalesce\(\(select auth\.jwt\(\) ->> 'aal'\), ''\) = 'aal2'/);
assert.match(migration, /create or replace function public\.is_admin\(\)[\s\S]*and public\.session_has_second_factor\(\)/);
assert.match(migration, /create or replace function public\.require_role[\s\S]*if r = 'admin' and not public\.session_has_second_factor\(\) then/);
// New SQL checks admins only through is_admin() / require_role().
const taxIds = read('supabase/migrations/20261111140000_registration_47_account_tax_ids.sql');
assert.doesNotMatch(taxIds.replace(/--.*$/gm, ''), /role\s*=\s*'admin'/, 'no inline admin check in migration 47');
assert.match(read('supabase/tests/00_supabase_stub.sql'), /create function auth\.jwt\(\)/);
assert.match(read('supabase/tests/99zzzzzzzzzzzz_admin_second_factor.test.sql'), /'aal1'/, 'database test covers password-only sessions');

console.log('PASS: administrators need the authenticator code in the app and in the database');
