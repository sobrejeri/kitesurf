import assert from 'node:assert/strict';
import { hasBookingLeadTime, hasScheduleConflict, slotsOverlap } from '../src/lib/student-schedule.ts';
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
assert.equal(hasScheduleConflict([], [reserved]), false);
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
