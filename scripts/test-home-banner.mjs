import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const home = readFileSync('src/app/aluno/(app)/inicio/page.tsx', 'utf8');
const search = readFileSync('src/components/student/lesson-search.tsx', 'utf8');

// The real homepage now has two branches, not the legacy HomePosterHero:
// returning students see a personalized dashboard, while new students see
// a photographic banner immediately followed by the booking search.
assert.ok(home.includes('<HomeDashboard bookings={bookings}') &&
  home.includes('const returning=bookings.length>0'),
  'Returning students must continue to receive their personal lessons dashboard');
assert.ok(home.includes('src="/images/promo-bordo.jpg"') &&
  home.includes('vento-atlantico-hero-photo') &&
  home.includes('id="atlantico-hero-title"') &&
  home.includes('<span>Liberdade</span>') &&
  home.includes('<em>rajada</em>') &&
  home.includes('vento-atlantico-hero-wave') &&
  home.includes('vento-atlantico-search-container'),
  'New students must see the reference-inspired photo-led Atlântico hero above the booking search');
assert.ok(!home.includes('src="/images/kite-lesson.webp"'),
  'Do not regress to the beach-class photo and oversized BORDO heading');
assert.ok(statSync('public/images/promo-bordo.jpg').size > 100_000,
  'Atlântico must use a high-resolution real kitesurfer photo');
assert.ok(home.includes('<LessonSearch') &&
  home.includes('studentLevel={kiteLevel?.effective'),
  'New students must keep the lesson search below the banner, respecting the selected level');
assert.ok(search.includes('id="buscar-aula"') &&
  search.includes('action="/aluno/reservar"'),
  'The search action must still lead to the existing reservation route');
assert.ok(search.includes('vento-atlantico-hour-popover') &&
  search.includes('name="horas"') &&
  search.includes('<Stepper hours={hours} onChange={setHours} />'),
  'Compact mobile booking must keep adjustable hours, pricing and selected hours submitted');

assert.ok(!home.includes('<StudentHero') && !home.includes('<HomePosterHero'),
  'Do not add a second hero above the current dashboard/campaign banner');
assert.ok(home.includes('getStudentBookingInstructorAvatar') &&
  home.includes('instructorPhotoUrl={instructorPhotoUrl}'),
  'Returning students keep the actual instructor photo where available');

// The app must use the same official owner-supplied artwork in every header.
const official = 'src/components/official-logo.tsx';
const officialSource = readFileSync(official, 'utf8');
const studentHero = readFileSync('src/components/student/modelo3-header.tsx', 'utf8');
const dashboard = readFileSync('src/components/student/home-dashboard.tsx', 'utf8');
const sunset = readFileSync('src/components/student/sunset.tsx', 'utf8');
const shells = readFileSync('src/components/shells.tsx', 'utf8');
const transparentLogoPath = 'public/images/ventokite-logo-transparente.png';
const transparentLogo = readFileSync(transparentLogoPath);
assert.ok(transparentLogo.length > 30_000 && transparentLogo.subarray(1, 4).toString() === 'PNG'
  && transparentLogo[25] === 6,
  'VentoKite logo must be a real RGBA PNG with a transparency channel');
assert.ok(officialSource.includes('ventokite-logo-transparente.png') &&
  !officialSource.includes('ventokite-logo-oficial.webp'),
  'OfficialLogo must load the transparent official brand PNG, never the white-backed source');
const authFrame = readFileSync('src/components/auth/area-auth.tsx', 'utf8');
assert.ok(authFrame.includes('kite-m3-auth-login-intro') &&
  authFrame.includes('<KiteModelo3Brand compact />') &&
  authFrame.includes('Bem-vindo <span className="text-sunrise">de volta.</span>') &&
  authFrame.includes('Acesse suas aulas.'),
  'Student login must center the logo immediately above a compact welcome message');
for (const [name, content] of [
  ['student hero', studentHero],
  ['student dashboard', dashboard],
  ['public Explore', home],
  ['partner/workspace headers', sunset],
  ['generic headers', shells],
]) {
  assert.ok(content.includes('OfficialLogo'), name + ' should use the official wordmark');
}

const atlanticoStyle = readFileSync('src/app/aluno/(app)/atlantico.css', 'utf8');
assert.ok(atlanticoStyle.includes('width: min(42.7vw, 158px)') &&
  atlanticoStyle.includes('.vento-atlantico-brand .vento-official-logo'),
  'Public Atlântico header should use the official logo at 70% mobile size');
assert.ok(atlanticoStyle.includes('.vento-atlantico-home .vento-atlantico-search {') &&
  atlanticoStyle.includes('background:transparent;') &&
  atlanticoStyle.includes('box-shadow:none;') &&
  atlanticoStyle.includes('-webkit-backdrop-filter:none;'),
  'Public booking form must not have the old outer card background, outline or blur');
assert.ok(atlanticoStyle.includes('width:min(100%,210px)') &&
  atlanticoStyle.includes('height:40px;') &&
  atlanticoStyle.includes('min-height:40px!important'),
  'Mobile Avançar CTA should be shorter and narrower than before');

console.log('PASS: current student home dashboard and photo campaign preserve booking route');
