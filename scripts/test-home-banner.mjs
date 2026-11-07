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
assert.ok(statSync('public/images/ventokite-logo-oficial.webp').size > 15_000,
  'Official VentoKite wordmark asset must be present in usable quality');
assert.ok(officialSource.includes('ventokite-logo-oficial.webp'),
  'OfficialLogo must load the owner-provided brand image');
for (const [name, content] of [
  ['student hero', studentHero],
  ['student dashboard', dashboard],
  ['public Explore', home],
  ['partner/workspace headers', sunset],
  ['generic headers', shells],
]) {
  assert.ok(content.includes('OfficialLogo'), name + ' should use the official wordmark');
}

console.log('PASS: current student home dashboard and photo campaign preserve booking route');
