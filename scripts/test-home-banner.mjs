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
  home.includes('href="/aluno/reservar"') &&
  home.includes('aria-label="Seu próximo bordo começa aqui'),
  'New students need the campaign banner linked to booking with an accessible label');
assert.ok(statSync('public/images/promo-bordo.jpg').size > 100_000,
  'The booking banner must be a proper high-resolution image');
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
