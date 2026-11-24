import assert from 'node:assert/strict';
import {
  groupInstructorLessons,
  instructorTodayLessons,
  nextScheduledInstructorLesson,
  resolveInstructorLessonTab,
  selectInstructorLesson,
  mayStartInstructorLesson,
} from '../src/lib/instructor-lesson-tabs.ts';

function booking(id, status, statuses) {
  return {
    id,
    code: 'TEST-' + id,
    status,
    booking_meetings: statuses.map(([meetingStatus, day], index) => ({
      id: id + '-' + (index + 1),
      position: index + 1,
      status: meetingStatus,
      starts_at: '2026-11-' + day + 'T11:00:00-03:00',
    })),
  };
}

const bookings = [
  booking('A', 'confirmed', [['done','03'], ['scheduled','05'], ['scheduled','07']]),
  booking('B', 'confirmed', [['in_progress','04']]),
  booking('C', 'confirmed', [['scheduled','04']]),
  booking('D', 'completed', [['done','02']]),
  booking('E', 'cancelled', [['cancelled','04']]),
  booking('F', 'awaiting_payment', [['scheduled','04']]),
];
const groups = groupInstructorLessons(bookings);
assert.deepEqual(groups.proximas.map(({ meeting }) => meeting.id), ['C-1','A-2','A-3']);
assert.deepEqual(groups.andamento.map(({ meeting }) => meeting.id), ['B-1']);
assert.deepEqual(groups.concluidas.map(({ meeting }) => meeting.id), ['A-1','D-1']);
assert.equal(resolveInstructorLessonTab(undefined,undefined,groups),'andamento',
  'Open in-progress tab first when an unfinished class exists');
assert.equal(resolveInstructorLessonTab('proximas',undefined,groups),'proximas');
assert.equal(resolveInstructorLessonTab(undefined,'D-1',groups),'concluidas',
  'Legacy deep links to completed meetings should still work');
assert.equal(resolveInstructorLessonTab(undefined,'A-2',groups),'proximas');
assert.equal(selectInstructorLesson(groups,'proximas','A-2')?.booking.id,'A');
assert.equal(selectInstructorLesson(groups,'andamento','B-1')?.booking.id,'B');
assert.equal(selectInstructorLesson(groups,'concluidas','D-1')?.booking.id,'D');
assert.equal(selectInstructorLesson(groups,'concluidas','A-2'),null,
  'Scheduled class should never open as completed');
assert.equal(selectInstructorLesson(groups,'andamento','other-instructor-id'),null,
  'Unknown or foreign meeting IDs must not expose forms or private details');
assert.equal(mayStartInstructorLesson(groups.proximas[0], '2026-11-04', v=>v.slice(0,10)),true,
  'Other student can attend while booking A is between its meetings');
assert.equal(mayStartInstructorLesson(groups.proximas[1], '2026-11-04', v=>v.slice(0,10)),false,
  'Future meetings cannot start before the planned day');
assert.equal(mayStartInstructorLesson(groups.proximas[1], '2026-11-05', v=>v.slice(0,10)),true,
  'Meeting 2 of the same booking is unlocked after its previous meeting is done');
const blocked = groupInstructorLessons([
  booking('G', 'confirmed', [['scheduled','03'],['scheduled','05']]),
]);
assert.equal(mayStartInstructorLesson(blocked.proximas[1], '2026-11-05', v=>v.slice(0,10)),false,
  'Day 2 is blocked until Day 1 is actually completed');
assert.equal(resolveInstructorLessonTab(undefined,undefined,groupInstructorLessons([
  booking('D', 'completed', [['done','02']]),
])), 'proximas', 'Without active class the initial tab must be safe');
console.log('PASS: instructor tabs group meetings correctly and preserve ordered start eligibility');

for (const [status, tab] of [['scheduled','proximas'], ['in_progress','andamento'], ['done','concluidas']]) {
  const entries = groupInstructorLessons([{
    status: 'confirmed',
    booking_meetings: [
      { id: 'later', starts_at: '2026-11-04T10:30:00-03:00', status },
      { id: 'earlier', starts_at: '2026-11-04T13:00:00Z', status },
    ],
  }]);
  const ids = entries[tab].map(({ meeting }) => meeting.id);
  assert.deepEqual(ids, tab === 'concluidas' ? ['later', 'earlier'] : ['earlier', 'later']);
}
console.log('PASS: instructor tabs order equivalent time zones chronologically');

const start = Date.parse('2026-11-05T14:00:00Z');
assert.equal(nextScheduledInstructorLesson(groups, start)?.meeting.id, 'A-2');
assert.equal(nextScheduledInstructorLesson(groups, start + 1)?.meeting.id, 'A-3');
assert.equal(nextScheduledInstructorLesson(groups, Date.parse('2026-11-10')), undefined);
console.log('PASS: the next lesson skips overdue unrecorded meetings and includes the exact start');

const dashboard = instructorTodayLessons(groups, Date.parse('2026-11-05T14:00:00Z'));
assert.deepEqual(dashboard.upcoming.map(({meeting})=>meeting.id), ['B-1','A-2','A-3']);
assert.deepEqual(dashboard.overdue.map(({meeting})=>meeting.id), ['C-1']);
assert.equal(instructorTodayLessons(groups, Date.parse('2026-11-10')).upcoming.length, 1, 'Only in-progress class remains after all scheduled starts');
console.log('PASS: instructor dashboard prioritizes active/future lessons and preserves overdue access');
