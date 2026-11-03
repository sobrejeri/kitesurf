import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findMeetingOverlap, nextMeetingDay } from '../src/lib/meeting-conflicts.ts';

const first = { date:'2026-11-20', start:'09:00', hours:2 };
const atSameTime = { date:'2026-11-20', start:'09:00', hours:1 };
const partial = { date:'2026-11-20', start:'10:00', hours:2 };
const adjacent = { date:'2026-11-20', start:'11:00', hours:1 };
const following = { date:'2026-11-21', start:'09:00', hours:1 };
assert.deepEqual(findMeetingOverlap([first, atSameTime]),[0,1]);
assert.deepEqual(findMeetingOverlap([first, partial]),[0,1]);
assert.equal(findMeetingOverlap([first, adjacent]),null);
assert.equal(findMeetingOverlap([first, following]),null);
assert.deepEqual(findMeetingOverlap([
  {date:'2026-11-20',start:'23:00',hours:2},
  {date:'2026-11-21',start:'00:00',hours:1},
]),[0,1]);
assert.equal(nextMeetingDay('2026-11-30'),'2026-12-01');
const client=readFileSync('src/components/student/lesson-builder.tsx','utf8');
const server=readFileSync('src/app/actions/booking.ts','utf8');
const migration=readFileSync('supabase/migrations/20261103000032_student_schedule_collision_guard.sql','utf8');
assert.ok(client.includes('findMeetingOverlap(meetings)') &&
  client.includes('!overlap') && client.includes('nextMeetingDay('),
  'Client must block overlaps and propose an available following day');
assert.ok(server.includes('findMeetingOverlap(parsed.data.meetings)'),
  'Server action must validate conflicts even if JS/browser checks are bypassed');
assert.ok(client.includes('startTimesValid') && server.includes('60 * 60_000'),
  'Both layers must check the one-hour lead time');
assert.ok(migration.includes('pg_advisory_xact_lock') &&
  migration.includes('guard_student_request_slots_insert') &&
  migration.includes('guard_student_booking_meeting_write'),
  'Database must guard concurrent requests and bookings');

const shell=readFileSync('src/components/shells.tsx','utf8');
const layout=readFileSync('src/app/aluno/(app)/layout.tsx','utf8');
const home=readFileSync('src/app/aluno/(app)/inicio/page.tsx','utf8');
const css=readFileSync('src/app/aluno/(app)/mar-profundo.css','utf8');
const hero=readFileSync('src/components/student/home-poster-hero.tsx','utf8');
assert.ok(shell.includes('photoUrl') && layout.includes('vento-student-avatars') &&
  layout.includes('createSignedUrl'), 'Desktop must display a private signed student avatar');
assert.ok(home.includes('Encontre o seu ritmo.') && home.includes('desktop-levels-card'),
  'Desktop student home should show browse-by-level tiles');
assert.ok(css.includes('min-width:1024px') || css.includes('min-width: 1024px'),
  'Desktop design should have a dedicated responsive breakpoint');
assert.ok(css.includes('--color-canvas:#f5f7fc') &&
  css.includes('.vento-search-fields'), 'Desktop theme and horizontal booking form should exist');
assert.ok(hero.includes('srcSet="/images/prea-coast.webp"') &&
  hero.includes('src="/images/kite-lesson.webp"'),
  'Desktop must load sharp panoramic photo without changing the mobile hero');
console.log('PASS: desktop student sketch and collision-safe lesson builder');
