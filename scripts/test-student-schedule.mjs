import assert from 'node:assert/strict';
import { hasScheduleConflict, slotsOverlap } from '../src/lib/student-schedule.ts';
import { lessonHasEvolution, lessonEvolutionHref } from '../src/lib/student-lesson-links.ts';

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
assert.equal(lessonHasEvolution('in_progress'), true);
assert.equal(lessonHasEvolution('done'), true);
assert.equal(lessonHasEvolution('scheduled'), false, 'A past clock time alone is not proof a lesson started');
assert.equal(lessonHasEvolution('cancelled'), false);
assert.equal(lessonEvolutionHref('booking-a', 'meeting-b'),
  '/aluno/evolucao?reserva=booking-a&encontro=meeting-b#encontro-meeting-b');
console.log('PASS: existing/new schedule overlaps, boundary times, timezones and per-meeting evolution links');
