import assert from 'node:assert/strict';
import { bookingBalanceMinutes, bookingIsFinished } from '../src/lib/booking-cycle.ts';

const meeting = (status, minutes, done_minutes = 0) => ({ status, minutes, done_minutes });

const balanceCases = [
  {
    name: 'fully delivered leaves no balance',
    booking: { total_hours: 2, booking_meetings: [meeting('done', 60, 60), meeting('done', 60, 60)] },
    expected: 0,
  },
  {
    name: 'a short record leaves the unrecorded minutes',
    booking: { total_hours: 2, booking_meetings: [meeting('done', 120, 90)] },
    expected: 30,
  },
  {
    name: 'scheduled minutes are still allocated, not balance',
    booking: { total_hours: 2, booking_meetings: [meeting('done', 60, 45), meeting('scheduled', 60)] },
    expected: 15,
  },
  {
    name: 'an in-progress meeting holds its minutes',
    booking: { total_hours: 2, booking_meetings: [meeting('in_progress', 120)] },
    expected: 0,
  },
  {
    name: 'cancelled minutes return to the balance',
    booking: { total_hours: 2, booking_meetings: [meeting('done', 60, 60), meeting('cancelled', 60)] },
    expected: 60,
  },
  {
    name: 'balance never goes negative',
    booking: { total_hours: 1, booking_meetings: [meeting('done', 60, 60), meeting('done', 30, 30)] },
    expected: 0,
  },
];

for (const { name, booking, expected } of balanceCases) {
  assert.equal(bookingBalanceMinutes(booking), expected, name);
}

const finishedCases = [
  {
    name: 'completed is always finished',
    booking: { status: 'completed', total_hours: 2, booking_meetings: [meeting('done', 120, 90)] },
    expected: true,
  },
  {
    name: 'confirmed and fully delivered is finished',
    booking: { status: 'confirmed', total_hours: 2, booking_meetings: [meeting('done', 60, 60), meeting('done', 60, 60)] },
    expected: true,
  },
  {
    name: 'confirmed with a balance is NOT finished',
    booking: { status: 'confirmed', total_hours: 2, booking_meetings: [meeting('done', 120, 90)] },
    expected: false,
  },
  {
    name: 'confirmed with a scheduled meeting is NOT finished',
    booking: { status: 'confirmed', total_hours: 2, booking_meetings: [meeting('done', 60, 60), meeting('scheduled', 60)] },
    expected: false,
  },
  {
    name: 'awaiting payment is never finished',
    booking: { status: 'awaiting_payment', total_hours: 1, booking_meetings: [meeting('scheduled', 60)] },
    expected: false,
  },
];

for (const { name, booking, expected } of finishedCases) {
  assert.equal(bookingIsFinished(booking), expected, name);
}

console.log(`Booking balance: all ${balanceCases.length + finishedCases.length} scenarios passed`);
