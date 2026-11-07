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
assert.ok(home.includes('src="/images/kite-lesson.webp"') &&
  home.includes('id="atlantico-hero-title"') &&
  home.includes('Liberdade em') &&
  home.includes('vento-atlantico-hero-wave') &&
  home.includes('vento-atlantico-search-container'),
  'New students must see the full photographic Atlântico hero leading directly into lesson search');
assert.ok(!home.includes('src="/images/promo-bordo.jpg"'),
  'Do not regress to the old shallow promotional image with baked-in text');
assert.ok(statSync('public/images/kite-lesson.webp').size > 100_000,
  'The photographic cover must use a proper high-resolution kitesurf image');
assert.ok(home.includes('<LessonSearch') &&
  home.includes('studentLevel={kiteLevel?.effective'),
  'New students must keep the lesson search below the banner, respecting the selected level');
assert.ok(search.includes('id="buscar-aula"') &&
  search.includes('action="/aluno/reservar"'),
  'The search action must still lead to the existing reservation route');
assert.ok(!home.includes('<StudentHero') && !home.includes('<HomePosterHero'),
  'Do not add a second hero above the current dashboard/campaign banner');
assert.ok(home.includes('getStudentBookingInstructorAvatar') &&
  home.includes('instructorPhotoUrl={instructorPhotoUrl}'),
  'Returning students keep the actual instructor photo where available');

console.log('PASS: current student home dashboard and photo campaign preserve booking route');
