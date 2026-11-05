import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeBookingStageMeetingIds, activeStudentBookings, bookingIsFinished, selectedStudentBooking, evolutionBookingStatus } from '../src/lib/booking-cycle.ts';

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
// Completed booking skill records must not be carried into a new booking or
// shown as in-progress after the last reservation has finished.
assert.deepEqual(activeBookingStageMeetingIds(null), [], 'Empty current path must have no skills');
assert.deepEqual(activeBookingStageMeetingIds(ongoingA), ['A-0'],
  'Current path must contain only completed meetings in selected booking');
assert.deepEqual(activeBookingStageMeetingIds(ongoingB), [],
  'New booking must begin with no completed skill stages');
assert.deepEqual(activeBookingStageMeetingIds(completed), ['old-0'],
  'Historical meetings are retained for archive reports');
console.log('PASS: current bookings use only their own skill stages; finished skills stay in history');

assert.equal(selectedStudentBooking([ongoingA, completed], undefined), null,
  'Evolution tab must not auto-expand a reservation');
assert.equal(selectedStudentBooking([ongoingA, completed], 'unknown'), null,
  'A guessed or foreign booking ID cannot open details');
assert.equal(selectedStudentBooking([ongoingA, completed], 'old')?.id, 'old',
  'A finished reservation must be selectable explicitly');
assert.equal(selectedStudentBooking([ongoingA, completed], 'A')?.id, 'A',
  'An active reservation must be selectable explicitly');
assert.equal(evolutionBookingStatus(ongoingA), 'Em andamento');
assert.equal(evolutionBookingStatus(ongoingB), 'Confirmada');
assert.equal(evolutionBookingStatus(completed), 'Concluída');
assert.equal(evolutionBookingStatus(waitingPayment), 'Aguardando pagamento');
assert.equal(evolutionBookingStatus(booking('cancel', 'cancelled', [], [])), 'Cancelada');
console.log('PASS: compact previews open only selected bookings with correct statuses');

const reservationPage = readFileSync('src/app/aluno/(app)/reserva/[id]/page.tsx', 'utf8');
const actionsStart = reservationPage.indexOf('<nav aria-label="Ações da reserva"');
const actionsEnd = reservationPage.indexOf('</nav>', actionsStart);
assert.ok(actionsStart >= 0 && actionsEnd > actionsStart,
  'Student reservation should expose an accessible, labeled action group');
const actionMarkup = reservationPage.slice(actionsStart, actionsEnd);
assert.ok(actionMarkup.includes('className="mt-5 grid w-full gap-2.5"'),
  'Reservation actions should be stacked and full width');
assert.equal(actionMarkup.split('className={reservationActionClass}').length-1, 2,
  'Only chat and completed-booking rehire should remain as full-width buttons');
assert.ok(actionMarkup.includes("booking.status === 'completed' && booking.instructor_id && balance.available === 0 ?"),
  'Rehire button must require completion and zero prepaid minutes remaining');
assert.ok(!actionMarkup.includes("booking.status === 'confirmed' ||"),
  'Confirmed or ongoing bookings must not show rehire button');
assert.ok(actionMarkup.includes('href={`/aluno/atendimento/${booking.id}`}') &&
  actionMarkup.includes('href={`/aluno/reservar?instrutor='),
  'Chat and rehire destinations should remain unchanged');
assert.ok(actionMarkup.includes('<Link') &&
  actionMarkup.includes('href="/aluno/ocorrencias"') &&
  actionMarkup.includes('underline underline-offset-4'),
  'Cancellation and unforeseen events should be a simple accessible text link');
assert.ok(!actionMarkup.includes('href="/aluno/politicas"') &&
  !actionMarkup.includes('Consultar regras da reserva'),
  'Redundant rules action must be removed from booking detail actions');
console.log('PASS: booking actions show primary chat, completed-only rehire and subtle issue link');
