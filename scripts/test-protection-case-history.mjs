import assert from 'node:assert/strict';
import {
  selectVisibleProtectionCaseIds, protectionCaseCanAcceptStatement,
} from '../src/lib/protection-case-history.ts';

const monitoredId = '00000000-0000-0000-0000-000000000010';
const doneId = '00000000-0000-0000-0000-000000000011';
const cancelledId = '00000000-0000-0000-0000-000000000012';
const formerInstructorId = '00000000-0000-0000-0000-000000000013';

assert.deepEqual(selectVisibleProtectionCaseIds([monitoredId], [
  { meetingId: doneId, createdAt: '2026-11-09T12:00:00Z' },
  { meetingId: cancelledId, createdAt: '2026-11-08T12:00:00Z' },
  { meetingId: doneId, createdAt: '2026-11-07T12:00:00Z' },
  { meetingId: formerInstructorId, createdAt: '2026-11-06T12:00:00Z' },
]), [monitoredId, doneId, cancelledId, formerInstructorId],
  'Reports remain discoverable even when the meeting is no longer in overdue monitoring');
assert.deepEqual(selectVisibleProtectionCaseIds([], [
  { meetingId: doneId, createdAt: '2026-11-09T12:00:00Z' },
]), [doneId], 'History does not depend on an active monitor item');
assert.deepEqual(selectVisibleProtectionCaseIds(['not-uuid', monitoredId], [
  { meetingId: 'bad', createdAt: 'not-a-time' },
],1), [monitoredId]);
assert.throws(() => selectVisibleProtectionCaseIds([], [], 201), RangeError);

const base = {
  area: 'aluno', viewerId: 'student-a', studentId: 'student-a',
  instructorId: 'instructor-a', bookingStatus: 'completed',
  startsAt: '2026-11-02T10:00:00Z', minutes: 60,
  nowMs: Date.parse('2026-11-09T20:00:00Z'),
};
assert.equal(protectionCaseCanAcceptStatement(base), true,
  'Completed booking can still accept a legitimate statement');
assert.equal(protectionCaseCanAcceptStatement({ ...base, bookingStatus:'cancelled' }), false);
assert.equal(protectionCaseCanAcceptStatement({ ...base, area:'instrutor',viewerId:'previous-instructor' }), false);
assert.equal(protectionCaseCanAcceptStatement({ ...base, area:'instrutor',viewerId:'instructor-a' }), true);
assert.equal(protectionCaseCanAcceptStatement({ ...base, area:'admin' }), false);
assert.equal(protectionCaseCanAcceptStatement({ ...base, startsAt:'2026-11-10T20:00:00Z' }), false);
assert.equal(protectionCaseCanAcceptStatement({ ...base, minutes:null }), false);
console.log('PASS: reported cases survive status changes and author permissions are checked');
