import assert from 'node:assert/strict';
import { listProtectionMonitorItems } from '../src/lib/protection-monitor.ts';

const h = 60 * 60 * 1000;
const day = 24 * h;
const end = Date.parse('2026-11-04T12:00:00-03:00');
const meeting = (overrides = {}) => ({
  id: 'meeting-a',
  bookingId: 'booking-a',
  bookingCode: 'VNT-TEST-1003',
  bookingStatus: 'confirmed',
  meetingStatus: 'scheduled',
  startsAt: '2026-11-04T11:00:00-03:00',
  minutes: 60,
  isTest: true,
  ...overrides,
});
const get = (nowMs, meetings = [meeting()]) => listProtectionMonitorItems(meetings, nowMs);

assert.equal(get(end - 1).length, 0, 'Still in the planned lesson window');
assert.equal(get(end)[0].phase, 'awaiting_record');
assert.equal(get(end + day - 1)[0].phase, 'awaiting_record');
assert.equal(get(end + day)[0].phase, 'response_window');
assert.equal(get(end + 5 * day - 1)[0].phase, 'response_window');
assert.equal(get(end + 5 * day)[0].phase, 'needs_admin_review');
assert.equal(get(end + 6 * day)[0].responseDeadlineMs, end + 5 * day);

for (const meetingStatus of ['done', 'in_progress', 'cancelled']) {
  assert.equal(get(end + 6 * day, [meeting({ meetingStatus })]).length, 0,
    meetingStatus + ' does not become an overdue scheduled meeting');
}
for (const bookingStatus of ['completed', 'cancelled', 'awaiting_payment']) {
  assert.equal(get(end + 6 * day, [meeting({ bookingStatus })]).length, 0);
}
assert.equal(get(end + 6 * day, [meeting({ minutes: -1 })]).length, 0);
assert.equal(get(end + 6 * day, [meeting({ startsAt: 'not-a-date' })]).length, 0);
assert.throws(() => get(NaN), RangeError);
assert.deepEqual(
  get(end + 6 * day, [
    meeting({ id: 'later', startsAt: '2026-11-05T11:00:00-03:00' }),
    meeting({ id: 'earlier' }),
  ]).map(x => x.id),
  ['earlier', 'later'], 'Oldest due first',
);
assert.equal(get(end + 6 * day)[0].isTest, true, 'Test bookings retain their no-money badge');
console.log('PASS: overdue meeting monitoring is read-only and uses 24h/5-day boundaries');
