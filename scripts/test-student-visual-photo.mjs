import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const kite = readFileSync('public/images/vento-kite-real.webp');
const sea = readFileSync('public/images/vento-ocean-hero.webp');
function assertRealWebP(bytes, label) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', label+' must be a real RIFF raster image');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', label+' must be WebP, never an SVG');
}
assertRealWebP(kite, 'Real Duotone kite');
assertRealWebP(sea, 'Ocean background photograph');
assert.ok(statSync('public/images/vento-kite-real.webp').size > 15000, 'Kite photograph must keep its texture');
assert.ok(statSync('public/images/vento-ocean-hero.webp').size > 30000, 'Hero ocean backdrop must remain high-detail');
assert.ok(!existsSync('public/images/kite-modelo3.svg'), 'The old kite vector should not be used');
const dashboard = read('src/components/student/home-dashboard.tsx');
const header = read('src/components/student/modelo3-header.tsx');
const hero = read('src/components/student/sunset.tsx');
const auth = read('src/components/auth/area-auth.tsx');
const authStyle = read('src/app/aluno/auth-modelo3.css');
const logoStyle = read('src/app/globals.css');
const logoPng = readFileSync('public/images/ventokite-logo-transparente.png');
const homeStyle = read('src/components/student/home-dashboard.module.css');
const sharedStyle = read('src/app/aluno/(app)/modelo3.css');
const shell = read('src/components/shells.tsx');
assert.ok(dashboard.includes('src="/images/vento-kite-real.webp"') &&
  dashboard.includes('src="/images/vento-ocean-hero.webp"'),
  'Personalized student dashboard must show the actual kite and coastal photograph');
for (const [name, content] of [['subpage header', header], ['lesson header', hero], ['authentication', auth]]) {
  assert.ok(content.includes('src="/images/vento-kite-real.webp"'), name+' must use the real photographic kite');
  assert.ok(!content.includes('kite-modelo3.svg'), name+' must not regress to vector kite');
}
assert.ok(homeStyle.includes('.welcome>.heroKite') &&
  homeStyle.includes('object-fit:contain') &&
  homeStyle.includes('text-shadow:0 3px 11px'),
  'Kite must remain separate from the legible, real HTML headline');
assert.ok(homeStyle.includes('#baff00') && homeStyle.includes('#7429cd') &&
  homeStyle.includes('.welcome h1 em::after') && homeStyle.includes('.next'),
  'Approved lime, purple reservation tag, hand lettering and glowing lesson card must survive');
assert.ok(sharedStyle.includes('/images/vento-ocean-hero.webp') &&
  sharedStyle.includes('kite-m3-wave-band') &&
  shell.includes('className="kite-m3-wave-band"'),
  'Secondary pages and bottom navigation must share the sea background and wave motif');
assert.ok(dashboard.includes('studentHomeSummary(bookings)') &&
  dashboard.includes('lessonEvolutionHref(current.booking.id, current.meeting.id)') &&
  dashboard.includes('/aluno/atendimento/'),
  'Visual work must not replace data-bound progress, booking and chat actions');
assert.ok(auth.includes("studentAuth ? '/images/prea-coast.webp'") &&
  auth.includes("area === 'aluno' && !studentAuth") &&
  auth.includes("kite-m3-auth--student-login") &&
  auth.includes("kite-m3-auth--student-signup"),
  'Both student auth pages must show the coast without the floating kite');
assert.ok(authStyle.includes('.kite-m3-auth--student-login > .sunset-photo') &&
  authStyle.includes('height: 100%') &&
  authStyle.includes('background: rgba(4, 56, 78, .10)') &&
  authStyle.includes('-webkit-backdrop-filter: none'),
  'Student login glass panel must stay 90% transparent above a full-height photo');
assert.ok(authStyle.includes('font-weight: 900') &&
  authStyle.includes('margin-top: 8px'),
  'Student login must keep its centered logo close to the bold welcome heading');
const brandRule = logoStyle.split('.vento-official-logo {')[1]?.split('}')[0] ?? '';
assert.ok(brandRule.includes('background: transparent') &&
  brandRule.includes('border: 0') &&
  brandRule.includes('padding: 0') &&
  brandRule.includes('box-shadow: none'),
  'The shared logo must never be presented on an artificial white rectangle');
assert.equal(logoPng.toString('hex', 0, 8), '89504e470d0a1a0a',
  'The shared official logo must remain a real PNG');
assert.equal(logoPng[25], 6,
  'The official logo must use RGBA PNG pixels with a real alpha channel');
assert.ok(authStyle.includes('.kite-m3-auth--student-signup > .sunset-photo') &&
  authStyle.includes('.kite-m3-auth-signup-panel') &&
  authStyle.includes('background: rgba(4, 56, 78, .10)') &&
  auth.includes('name="kiteLevel" required defaultValue=""') &&
  auth.includes('minLength={8}'),
  'Student signup must keep its required fields and matching transparent coastal theme');
console.log('PASS: photographic kite and matching responsive student visual language');
