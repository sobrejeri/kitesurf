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
    name: '120 contracted, 90 delivered leaves exactly 30 minutes to make up',
    booking: { total_hours: 2, booking_meetings: [meeting('done', 120, 90)] },
    expected: 30,
  },
  {
    name: '90 delivered and 30 make-up scheduled reserves the remaining balance',
    booking: { total_hours: 2, booking_meetings: [meeting('done', 120, 90), meeting('scheduled', 30)] },
    expected: 0,
  },
  {
    name: '90 delivered and 30 make-up in progress cannot be booked again',
    booking: { total_hours: 2, booking_meetings: [meeting('done', 120, 90), meeting('in_progress', 30)] },
    expected: 0,
  },
  {
    name: '90 delivered plus 30 recorded completes exactly 120 without extra billing',
    booking: { total_hours: 2, booking_meetings: [meeting('done', 120, 90), meeting('done', 30, 30)] },
    expected: 0,
  },
  {
    name: 'cancelled 30-minute make-up returns 30 to balance',
    booking: { total_hours: 2, booking_meetings: [meeting('done', 120, 90), meeting('cancelled', 30)] },
    expected: 30,
  },
  {
    name: '4h in two meetings remains fully allocated before either meeting',
    booking: { total_hours: 4, booking_meetings: [meeting('scheduled', 120), meeting('scheduled', 120)] },
    expected: 0,
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
    name: 'confirmed 90 delivered and 30 make-up scheduled is NOT finished',
    booking: { status: 'confirmed', total_hours: 2, booking_meetings: [meeting('done', 120, 90), meeting('scheduled', 30)] },
    expected: false,
  },
  {
    name: 'confirmed 90 delivered and 30 make-up recorded IS finished',
    booking: { status: 'confirmed', total_hours: 2, booking_meetings: [meeting('done', 120, 90), meeting('done', 30, 30)] },
    expected: true,
  },
  {
    name: 'confirmed 90 delivered and cancelled make-up is NOT finished',
    booking: { status: 'confirmed', total_hours: 2, booking_meetings: [meeting('done', 120, 90), meeting('cancelled', 30)] },
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
