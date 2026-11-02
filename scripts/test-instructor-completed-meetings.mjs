import assert from 'node:assert/strict';
import {
  listCompletedInstructorMeetings,
  findCompletedInstructorMeeting,
} from '../src/lib/instructor-completed-meetings.ts';

function booking(id, meetings) {
  return {
    id,
    booking_meetings: meetings.map(([meetingId, status, startsAt]) => ({
      id: meetingId,
      status,
      starts_at: startsAt,
    })),
  };
}

const own = [
  booking('A', [
    ['done-old', 'done', '2026-11-02T13:00:00Z'],
    ['scheduled-later', 'scheduled', '2026-11-05T13:00:00Z'],
    ['active-now', 'in_progress', '2026-11-02T15:00:00Z'],
  ]),
  booking('B', [
    ['done-new', 'done', '2026-11-03T13:00:00Z'],
    ['cancelled', 'cancelled', '2026-11-04T13:00:00Z'],
  ]),
];

const completed = listCompletedInstructorMeetings(own);
assert.deepEqual(completed.map(({ meeting }) => meeting.id), ['done-new', 'done-old'],
  'Show every finished meeting, even within an active multi-day booking');
assert.equal(findCompletedInstructorMeeting(completed, undefined), null,
  'History never opens automatically');
assert.equal(findCompletedInstructorMeeting(completed, 'scheduled-later'), null,
  'A future encounter cannot be opened as completed');
assert.equal(findCompletedInstructorMeeting(completed, 'active-now'), null,
  'An in-progress encounter is not in the completed archive');
assert.equal(findCompletedInstructorMeeting(completed, 'other-instructor-meeting'), null,
  'Do not resolve IDs outside the instructor-scoped list');
assert.equal(findCompletedInstructorMeeting(completed, 'done-old')?.booking.id, 'A',
  'History selection must identify the correct booking');
assert.equal(findCompletedInstructorMeeting(completed, 'done-new')?.booking.id, 'B',
  'Finished meetings from other owned bookings remain available');
console.log('PASS: completed lesson history opens only owned, finished meetings');
