import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { APP_AREAS, areaFromParam, areaFromPath, loginPath, safeNextFor, sessionCookieName } from '../src/lib/app-areas.ts';
import { AFFILIATE_NAV } from '../src/components/workspace-nav.ts';

// The Pousada app became the Afiliado app (2026-11-11). The database keeps the
// `partner` role and tables; routes, names and the workspace changed, with
// compatibility for links, bookmarks and sessions created before the rename.
const read = (path) => readFileSync(path, 'utf8');

// 1. Area definition and compatibility.
assert.equal(APP_AREAS.afiliado.role, 'partner', 'Affiliates are still partner accounts in the database');
assert.equal(APP_AREAS.afiliado.home, '/afiliado/inicio');
assert.ok(APP_AREAS.afiliado.signup, 'Affiliates can create their own account');
assert.ok(!('pousada' in APP_AREAS), 'No separate Pousada app any more');
assert.equal(areaFromPath('/afiliado/divulgacao'), 'afiliado');
assert.equal(areaFromParam('pousada'), 'afiliado', 'E-mail links sent as area=pousada still reach the affiliate app');
assert.equal(areaFromParam('afiliado'), 'afiliado');
assert.equal(areaFromParam('nada'), null);
assert.equal(sessionCookieName('afiliado'), 'vento-pousada-auth', 'Signed-in affiliates keep their session after the rename');
assert.equal(sessionCookieName('aluno'), 'vento-aluno-auth');
assert.equal(loginPath('afiliado', '/afiliado/perfil'), '/afiliado/entrar?next=%2Fafiliado%2Fperfil');
assert.equal(safeNextFor('afiliado', '/afiliado/indicacoes'), '/afiliado/indicacoes');
assert.equal(safeNextFor('afiliado', '/admin/visao'), null, 'A post-login redirect never leaves the affiliate app');

for (const route of ['src/app/auth/confirm/route.ts', 'src/app/auth/recovery/route.ts']) {
  assert.match(read(route), /areaFromParam\(requested\) \?\? 'aluno'/, `${route} must accept legacy area names`);
}
const config = read('next.config.mjs');
assert.match(config, /source: '\/pousada', destination: '\/afiliado\/inicio', permanent: false/);
assert.match(config, /source: '\/pousada\/:path\*', destination: '\/afiliado\/:path\*', permanent: false/,
  'Old /pousada links redirect (307) to the same affiliate page');
assert.match(read('src/proxy.ts'), /\(aluno\|instrutor\|admin\|afiliado\)\\\/\(entrar\|criar-conta\|recuperar\|redefinir\)/,
  'Affiliate sign-in screens stay public');
assert.ok(!existsSync('src/app/pousada'), 'Pages live under /afiliado only');

// No route literal still points at /pousada (redirects and compat aside).
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : /\.(tsx?|mjs)$/.test(entry.name) ? [join(dir, entry.name)] : []);
for (const file of walk('src')) {
  assert.doesNotMatch(read(file), /['"`]\/pousada\//, `${file} still links to /pousada`);
}

// 2. Workspace menu: every link has a page, four phone tabs, grouped.
const hrefs = AFFILIATE_NAV.map((item) => item.href);
assert.equal(new Set(hrefs).size, hrefs.length);
for (const item of AFFILIATE_NAV) {
  assert.ok(existsSync(join('src/app/afiliado/(app)', item.href.replace('/afiliado/', ''), 'page.tsx')), `${item.href} has no page`);
}
assert.equal(AFFILIATE_NAV.filter((item) => item.tab).length, 4, 'Four phone tabs plus Mais');
const pages = readdirSync('src/app/afiliado/(app)', { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => `/afiliado/${entry.name}`);
for (const page of pages) {
  if (page === '/afiliado/cadastro') continue; // first-time registration, reached by redirect
  assert.ok(hrefs.includes(page), `${page} is not reachable from the affiliate menu`);
}
const layout = read('src/app/afiliado/(app)/layout.tsx');
assert.ok(layout.includes('<WorkspaceShell') && layout.includes('nav={AFFILIATE_NAV}') && layout.includes("requireRole(['partner']"),
  'Affiliate area uses the professional workspace and still requires a partner account');
assert.ok(!read('src/components/shells.tsx').includes('export function PartnerShell'), 'The old Pousada shell is gone');
assert.ok(read('src/components/shells.tsx').includes("/^\\/(instrutor|admin|afiliado)(\\/|$)/.test(pathname)) return null"),
  'The site account bar steps aside in the affiliate workspace, like Instrutor and Admin');
assert.doesNotMatch(read('src/components/admin/profile-photo.tsx'), /name="home"/, 'Affiliates are not shown with a house icon');

// 3. Affiliate wording: no inn-only language left on the affiliate screens.
for (const file of walk('src/app/afiliado')) {
  const source = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(source, /hóspede|Área da pousada|Cadastrar pousada|Nome da pousada|pousada parceira/i, `${file} still speaks to a pousada`);
}
assert.match(read('src/components/auth/area-auth.tsx'), /afiliado: \{ title: 'Indique e ganhe\.'/);
assert.match(read('src/app/entrar/page.tsx'), /\{ area: 'afiliado', icon: 'link', text: 'Sou afiliado' \}/);
assert.match(read('src/components/shells.tsx'), /href="\/afiliado\/criar-conta"/, 'Student footer invites affiliates');

// 4. Sharing tools: local QR (no external QR service) and ready messages.
const qr = read('src/components/affiliate/referral-qr.tsx');
assert.ok(qr.includes("from '@/vendor/qrcodegen'") && !/https?:\/\/(?!www\.w3\.org)/.test(qr), 'QR Code is generated locally');
assert.ok(qr.includes('download='), 'QR Code can be downloaded for printing');
const referral = read('src/lib/referral.ts');
assert.ok(referral.includes('`${SITE_URL}/aluno/inicio?ref=${encodeURIComponent(code)}`'), 'Referral link keeps the student ?ref= flow');
const promote = read('src/app/afiliado/(app)/divulgacao/page.tsx');
assert.ok(promote.includes("partner.status === 'approved'") && promote.includes('<ReferralQR') && promote.includes('referralMessages(link)'),
  'Link, QR and messages show only for an approved affiliate');

// 5. Installable app.
function pngSize(path) {
  const buffer = readFileSync(path);
  return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}
const manifest = JSON.parse(read('public/apps/afiliado.webmanifest'));
assert.equal(manifest.id, '/afiliado/');
assert.equal(manifest.scope, '/afiliado/');
assert.equal(manifest.start_url, '/afiliado/inicio');
assert.equal(manifest.name, 'VentoKite Afiliados');
assert.equal(manifest.theme_color, '#0b1220');
for (const icon of manifest.icons) assert.equal(pngSize(join('public', icon.src)), icon.sizes, `${icon.src} size`);
for (const shortcut of manifest.shortcuts) {
  assert.ok(shortcut.url.startsWith('/afiliado/') && hrefs.includes(shortcut.url), `shortcut ${shortcut.url}`);
}
const appLayout = read('src/app/afiliado/layout.tsx');
assert.ok(appLayout.includes("manifest: '/apps/afiliado.webmanifest'") && appLayout.includes("themeColor: '#0b1220'"));
assert.ok(!existsSync('public/apps/pousada.webmanifest'), 'Old Pousada manifest removed');

console.log('PASS: Pousada became Afiliado with redirects, kept sessions, legacy links, workspace menu, sharing tools and PWA');
