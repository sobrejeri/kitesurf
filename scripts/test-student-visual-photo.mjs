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
console.log('PASS: photographic kite and matching responsive student visual language');
