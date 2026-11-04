import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const shell = read('src/components/shells.tsx');
const layout = read('src/app/aluno/(app)/layout.tsx');
const home = read('src/app/aluno/(app)/inicio/page.tsx');
const hero = read('src/components/student/home-poster-hero.tsx');
const css = read('src/app/aluno/(app)/mar-profundo.css');
const search = read('src/components/student/lesson-search.tsx');
const builder = read('src/components/student/lesson-builder.tsx');
const booking = read('src/app/actions/booking.ts');
const migration = read('supabase/migrations/20261103000032_student_request_schedule_guard.sql');

assert.ok(shell.includes('vento-desktop-student-header'), 'Desktop student should own its header');
assert.ok(layout.includes('vento-student-avatars') &&
  layout.includes('.createSignedUrl(profile.avatar_path, 3600)'),
  'Signed-in student avatar should come from the private Storage bucket');
assert.ok(shell.includes('photoUrl ?') && shell.includes('object-cover'),
  'Desktop profile circle should render the avatar, with initials fallback');
assert.ok(hero.includes('vento-desktop-home-hero') && hero.includes('lg:hidden'),
  'Desktop hero must be distinct from the existing mobile banner');
assert.ok(statSync('public/images/prea-coast.webp').size > 100_000,
  'Desktop photograph must not be a pixelated thumbnail');
assert.ok(home.includes('vento-student-desktop-home') &&
  home.includes('vento-desktop-course-cards'),
  'Explore desktop should have its own page composition');
assert.ok(css.includes('grid-template-columns: minmax(120px,1fr)') &&
  css.includes('body:has(.theme-mar-profundo) > .sticky.top-0'),
  'Desktop search should be a horizontal row with a single header');
assert.ok(search.includes('vento-desktop-search-fields') &&
  search.includes('action="/aluno/reservar"'),
  'Desktop booking controls must still submit through the existing reservation route');
assert.ok(builder.includes('meetingsOverlap') &&
  builder.includes('!meetingsOverlap') &&
  builder.includes('Você colocou dois encontros no mesmo horário'),
  'A student should see immediate feedback for overlapping meetings');
assert.ok(migration.includes('pg_advisory_xact_lock') &&
  migration.includes("r.status = 'searching'") &&
  migration.includes("b.status IN ('awaiting_payment', 'confirmed')"),
  'The backend must reject simultaneous requests and conflicts with existing bookings');
assert.ok(booking.includes("create_instructor_request_with_preference"),
  'Student search should still call the secure instructor queue RPC');
console.log('PASS: desktop layout and profile photo plus layered meeting-conflict protection');
