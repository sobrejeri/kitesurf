import assert from 'node:assert/strict';
import { hasBookingLeadTime, hasExactMeetingAllocation, hasRepeatedMeetingDay, hasScheduleConflict, slotsOverlap } from '../src/lib/student-schedule.ts';
import { lessonHasEvolution, lessonEvolutionHref, lessonIsPast, lessonNeedsInstructorRecord } from '../src/lib/student-lesson-links.ts';

const slot = (startsAt, minutes = 120) => ({ startsAt, minutes });
const reserved = slot('2026-11-11T11:00:00-03:00');
assert.equal(hasScheduleConflict([reserved], [reserved]), true);
assert.equal(hasScheduleConflict([slot('2026-11-11T12:30:00-03:00', 60)], [reserved]), true);
assert.equal(hasScheduleConflict([slot('2026-11-11T10:30:00-03:00', 60)], [reserved]), true);
assert.equal(hasScheduleConflict([slot('2026-11-11T13:00:00-03:00', 60)], [reserved]), false);
assert.equal(hasScheduleConflict([slot('2026-11-12T11:00:00-03:00')], [reserved]), false);
assert.equal(hasScheduleConflict([reserved, slot('2026-11-11T12:00:00-03:00')]), true);
assert.equal(slotsOverlap(reserved, slot('2026-11-11T14:00:00Z')), true, 'Timezone-equivalent slots overlap');
assert.equal(slotsOverlap(slot('2026-11-11T23:00:00-03:00'), slot('2026-11-12T00:30:00-03:00')), true);
assert.equal(hasScheduleConflict([], [reserved]), true, 'Empty proposed schedule must be rejected');
assert.equal(hasScheduleConflict([]), true, 'Empty booking without occupied slots must be rejected');
assert.equal(hasScheduleConflict([slot('2026-11-11T11:00:00')]), true, 'Naive local timestamps must be rejected');
assert.equal(hasScheduleConflict([slot('2026-11-11 11:00:00')]), true, 'Non-ISO local timestamps must be rejected');
for (const impossible of [
  '2026-02-30T11:00:00-03:00',
  '2025-02-29T11:00:00-03:00',
  '2026-04-31T11:00:00-03:00',
  '2026-11-11T24:00:00-03:00',
  '2026-11-11T11:00:60-03:00',
  '2026-11-11T11:00:00+24:00',
  '2026-11-11T11:00:00+03:60',
  '2026-11-11T11:00:00+15:00',
  '2026-11-11T11:00:00-14:01',
  '2026-11-11T11:00:00+13:60',
]) {
  assert.equal(hasScheduleConflict([slot(impossible)]), true, 'Impossible calendar dates cannot be normalized');
}
assert.equal(hasScheduleConflict([slot('2028-02-29T11:00:00-03:00')]), false, 'Valid leap days are allowed');
assert.equal(hasScheduleConflict([slot('2026-11-11T11:00:00+14:00')]), false, 'UTC+14:00 remains valid');
assert.equal(hasScheduleConflict([slot('2026-11-11T11:00:00-12:00')]), false, 'UTC-12:00 remains valid');
assert.equal(slotsOverlap(slot('2026-11-11T14:00:00Z'), reserved), true, 'Explicit UTC and Ceará offsets compare equally');
assert.equal(slotsOverlap(slot('2026-11-11T14:00:00.123456+00:00'), reserved), true, 'PostgreSQL microsecond timestamps remain valid');

// Invalid timestamps or durations must never silently pass conflict validation.
for (const invalid of [
  slot('invalid-date'),
  slot('2026-11-11T11:00:00-03:00', 0),
  slot('2026-11-11T11:00:00-03:00', -60),
  slot('2026-11-11T11:00:00-03:00', Number.NaN),
  slot('2026-11-11T11:00:00-03:00', Number.POSITIVE_INFINITY),
  slot('2026-11-11T11:00:00-03:00', 1.5),
]) {
  assert.equal(slotsOverlap(invalid, reserved), true, 'Malformed proposed intervals fail closed');
  assert.equal(slotsOverlap(reserved, invalid), true, 'Malformed occupied intervals fail closed');
  assert.equal(hasScheduleConflict([invalid]), true, 'Invalid single meeting cannot bypass validation');
  assert.equal(hasScheduleConflict([invalid], [reserved]), true);
  assert.equal(hasScheduleConflict([reserved], [invalid]), true);
}

assert.equal(lessonHasEvolution('in_progress'), true);
assert.equal(lessonHasEvolution('done'), true);
assert.equal(lessonHasEvolution('scheduled'), false, 'A past clock time alone is not proof a lesson started');
assert.equal(lessonHasEvolution('cancelled'), false);
assert.equal(lessonIsPast('in_progress', '2026-11-01T10:00:00Z', 120, Date.parse('2026-11-04T10:00:00Z')), false);
assert.equal(lessonIsPast('scheduled', '2026-11-01T10:00:00Z', 120, Date.parse('2026-11-04T10:00:00Z')), true);
assert.equal(lessonIsPast('done', '2026-11-11T10:00:00Z', 120, Date.parse('2026-11-04T10:00:00Z')), true);
const after = Date.parse('2026-11-09T17:17:00-03:00');
const startedPast = '2026-11-04T11:00:00-03:00';
assert.equal(lessonNeedsInstructorRecord('scheduled', startedPast, 60, after), true,
  'A past scheduled meeting must show Aguardando registro in both list and voucher');
assert.equal(lessonNeedsInstructorRecord('scheduled', '2026-11-11T11:00:00-03:00', 60, after), false,
  'Future scheduled meetings remain Agendada');
assert.equal(lessonNeedsInstructorRecord('scheduled', startedPast, 60, Date.parse('2026-11-04T11:30:00-03:00')), false,
  'Do not flag as overdue until the scheduled meeting ends');
for (const status of ['done', 'in_progress', 'cancelled']) {
  assert.equal(lessonNeedsInstructorRecord(status, startedPast, 60, after), false,
    status + ' is not a meeting awaiting initial record');
}
assert.equal(lessonEvolutionHref('booking-a', 'meeting-b'),
  '/aluno/evolucao?reserva=booking-a&encontro=meeting-b#encontro-meeting-b');
console.log('PASS: existing/new schedule overlaps, boundary times, timezones and per-meeting evolution links');

const now = Date.parse('2026-11-12T09:00:00-03:00');
assert.equal(hasBookingLeadTime(Date.parse('2026-11-12T12:59:59.999Z'), now), false);
assert.equal(hasBookingLeadTime(Date.parse('2026-11-12T10:00:00-03:00'), now), true);
assert.equal(hasBookingLeadTime(Date.parse('2026-11-12T13:00:00Z'), now), true);
assert.equal(hasBookingLeadTime(Number.NaN, now), false);

// Main E2E target: a 4h package distributed as two 2h meetings.
assert.equal(hasExactMeetingAllocation([2, 2], 4), true);
assert.equal(hasExactMeetingAllocation([2, 1], 4), false, 'Incomplete allocation is rejected');
assert.equal(hasExactMeetingAllocation([2, 2, 1], 4), false, 'Extra hours are rejected');
assert.equal(hasExactMeetingAllocation([4], 4), true, 'One-meeting packages remain valid');
assert.equal(hasExactMeetingAllocation([2, 2]), true, 'Legacy clients still use server-derived total');
for (const invalid of [[], [0, 4], [-1, 5], [1.5, 2.5], [9], [Number.NaN, 4], [Number.POSITIVE_INFINITY]]) {
  assert.equal(hasExactMeetingAllocation(invalid, 4), false);
}
assert.equal(hasExactMeetingAllocation([2, 2], Number.NaN), false);
const firstTwoHours = slot('2026-11-17T09:00:00-03:00', 120);
const secondTwoHours = slot('2026-11-19T09:00:00-03:00', 120);
assert.equal(hasScheduleConflict([firstTwoHours, secondTwoHours]), false);
assert.equal(hasScheduleConflict([firstTwoHours, secondTwoHours], [secondTwoHours]), true);
console.log('PASS: exact 4h/two-meeting allocation and schedule collision regression');

assert.equal(hasRepeatedMeetingDay(['2026-11-17', '2026-11-19']), false, '4h across two distinct days allowed');
assert.equal(hasRepeatedMeetingDay(['2026-11-17', '2026-11-17']), true, 'Two adjacent meetings on the same day are forbidden');
assert.equal(hasRepeatedMeetingDay(['2026-11-17', '2026-11-18', '2026-11-17']), true, 'Non-adjacent duplicate day rejected');
assert.equal(hasRepeatedMeetingDay(['invalid']), true, 'Malformed day rejected');
for (const invalidDay of ['2026-02-30', '2026-04-31', '2025-02-29', '2026-00-01', '2026-13-01', '0000-01-01']) {
  assert.equal(hasRepeatedMeetingDay([invalidDay]), true, 'Impossible day must be rejected: ' + invalidDay);
}
assert.equal(hasRepeatedMeetingDay(['2028-02-29', '2028-03-01']), false, 'Valid leap day must be accepted');
const changeAction = (await import('node:fs')).readFileSync(new URL('../src/app/actions/meeting-change.ts', import.meta.url), 'utf8');
assert.match(changeAction, /hasRepeatedMeetingDay\(\[parsed\.data\.proposedDate\.slice\(0, 10\)\]\)/,
  'Rescheduling must reject impossible civil dates before parsing timestamps');
console.log('PASS: one encounter per calendar day and reschedule date guard');

// The instructor must not fall back to an older RPC that skips ordering/window guards.
import { readFileSync } from 'node:fs';
const instructorActions = readFileSync(new URL('../src/app/actions/instructor.ts', import.meta.url), 'utf8');
assert.match(instructorActions, /rpc\('start_ordered_meeting'/);
assert.doesNotMatch(instructorActions, /rpc\('start_meeting'/, 'No legacy start fallback is allowed');
console.log('PASS: instructor start action requires ordered meeting RPC');

// Queue maintenance must remain opt-in, authenticated, bounded and server-only.
const workerSource = readFileSync(new URL('../src/app/api/internal/queue-maintenance/route.ts', import.meta.url), 'utf8');
assert.match(workerSource, /QUEUE_WORKER_ENABLED !== 'true'/);
assert.match(workerSource, /timingSafeEqual/);
assert.match(workerSource, /QUEUE_WORKER_TOKEN/);
assert.match(workerSource, /SUPABASE_SECRET_KEY/);
assert.match(workerSource, /\.limit\(20\)/);
assert.match(workerSource, /advance_instructor_offer/);
assert.doesNotMatch(workerSource, /export async function GET/);
console.log('PASS: queue worker is opt-in, authenticated and bounded');

// Keep the isolated checkout contract covered by the existing CI regression entrypoint.
await import('./test-checkout-sandbox.mjs');

// Exercise the actual worker POST handler with isolated backend mocks.
await import('./test-queue-worker-http.mjs');

// Isolated server-action regression for the instructor half of the 4h/2-meeting flow.
await import('./test-instructor-meeting-actions.mjs');

// Validate the student half of the 4h/2-meeting E2E target using real server action and isolated mocks.
await import('./test-booking-four-hours-action.mjs');

// Isolated 72h reschedule and cancellation-choice server action regression.
await import('./test-meeting-change-actions.mjs');

await import('./test-student-occupied-slots.mjs');

await import('./test-queue-maintenance-route.mjs');
