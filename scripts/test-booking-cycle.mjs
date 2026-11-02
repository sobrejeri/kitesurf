import assert from 'node:assert/strict';
import { activeStudentBookings, bookingIsFinished } from '../src/lib/booking-cycle.ts';

function booking(id, status, starts, meetingStatuses) {
  return {
    id,
    code: 'VNT-' + id,
    status,
    created_at: '2026-11-01T12:00:00Z',
    booking_meetings: meetingStatuses.map((state, index) => ({
      id: id + '-' + index,
      status: state,
      starts_at: starts[index] ?? '2026-11-10T12:00:00Z',
    })),
  };
}
const completed = booking('old', 'completed', ['2026-11-01T12:00:00Z'], ['done']);
const ongoingA = booking('A', 'confirmed',
  ['2026-11-03T12:00:00Z', '2026-11-05T12:00:00Z'], ['done', 'scheduled']);
const ongoingB = booking('B', 'confirmed', ['2026-11-04T12:00:00Z'], ['scheduled']);
const anotherCompleted = booking('C', 'confirmed', ['2026-11-01T12:00:00Z'], ['done']);
const waitingPayment = booking('D', 'awaiting_payment', ['2026-11-10T12:00:00Z'], ['scheduled']);

assert.equal(bookingIsFinished(completed), true);
assert.equal(bookingIsFinished(anotherCompleted), true);
assert.equal(bookingIsFinished(ongoingA), false);
assert.deepEqual(
  activeStudentBookings([completed, ongoingB, ongoingA, anotherCompleted, waitingPayment]).map(b=>b.id),
  ['B','A'], // earliest remaining scheduled meeting on A is Nov 5, B on Nov 4
);
assert.equal(activeStudentBookings([completed, anotherCompleted, waitingPayment]).length, 0);
assert.equal(ongoingA.booking_meetings[0].status, 'done'); // day 1 stays complete
assert.equal(ongoingA.booking_meetings[1].status, 'scheduled'); // day 2 stays scheduled
console.log('PASS: current reservations stay separate and completed bookings move to history');
