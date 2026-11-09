import assert from 'node:assert/strict';
import {
  assessLessonProtection, PROTECTION_FIRST_REMINDER_MS, PROTECTION_RESPONSE_WINDOW_MS,
} from '../src/lib/lesson-protection-policy.ts';

const end = Date.parse('2026-11-04T12:00:00-03:00');
const DAY = 24 * 60 * 60 * 1000;
const base = {
  scheduledEndMs: end,
  nowMs: end,
  verifiedCheckIn: false,
  studentStatement: 'none',
  instructorStatement: 'none',
};

function phase(overrides = {}) {
  return assessLessonProtection({ ...base, ...overrides });
}

assert.equal(PROTECTION_RESPONSE_WINDOW_MS, 5 * DAY);
assert.equal(PROTECTION_FIRST_REMINDER_MS, DAY);
assert.equal(phase({ nowMs: end - 1 }).phase, 'not_due');
assert.equal(phase({ nowMs: end - 1 }).needsIncidentHandling, false);
assert.equal(phase({ nowMs: end }).phase, 'awaiting_statements');
assert.equal(phase({ nowMs: end + DAY - 1 }).notifyMissingParties, false);
assert.equal(phase({ nowMs: end + DAY }).notifyMissingParties, true);
assert.equal(phase({ nowMs: end + 5 * DAY - 1 }).phase, 'awaiting_statements');
assert.equal(phase({ nowMs: end + 5 * DAY }).phase, 'admin_review');
assert.equal(phase({ nowMs: end + 5 * DAY }).requiresAdminReview, true);
assert.equal(phase({ nowMs: end + 5 * DAY }).notifyMissingParties, false);
assert.equal(phase({ nowMs: end + DAY, verifiedCheckIn: true }).phase, 'presence_documented',
  'Check-in only confirms presence, not full minutes delivered');
assert.equal(phase({
  nowMs: end + DAY, studentStatement: 'delivered', instructorStatement: 'delivered',
}).phase, 'matching_statements');
assert.equal(phase({
  nowMs: end + DAY, studentStatement: 'not_delivered', instructorStatement: 'delivered',
}).phase, 'conflicting_statements');
assert.equal(phase({
  nowMs: end + DAY, studentStatement: 'not_delivered', instructorStatement: 'delivered',
}).requiresAdminReview, true);
assert.equal(phase({
  nowMs: end + DAY, studentStatement: 'none', instructorStatement: 'delivered',
}).autoReleaseAuthorized, false, 'Student silence is never payout consent');
assert.equal(phase({
  nowMs: end + 6 * DAY, studentStatement: 'none', instructorStatement: 'delivered',
}).phase, 'admin_review', 'Day six still requires independent review');
assert.equal(phase({
  nowMs: end + 2 * DAY, studentStatement: 'not_delivered', instructorStatement: 'none',
}).autoReleaseAuthorized, false, 'Instructor silence does not authorize automatic refund or payout');
assert.equal(phase({
  nowMs: end + DAY, studentStatement: 'weather_or_safety', instructorStatement: 'weather_or_safety',
}).autoReleaseAuthorized, false, 'Agreed weather incidents need a resolution workflow');
assert.equal(phase({ nowMs: end + DAY }).settlementHoldRecommended, true);
assert.equal(phase({ nowMs: end - 1 }).settlementHoldRecommended, false);
assert.equal(phase({ nowMs: end + DAY }).responseDeadlineMs, end + 5 * DAY);
assert.throws(() => phase({ nowMs: Number.NaN }), RangeError);
assert.throws(() => phase({ scheduledEndMs: -1 }), RangeError);
for (const studentStatement of ['none', 'delivered', 'not_delivered', 'partially_delivered', 'student_absent', 'weather_or_safety']) {
  for (const instructorStatement of ['none', 'delivered', 'not_delivered', 'partially_delivered', 'student_absent', 'weather_or_safety']) {
    for (const nowMs of [end - 1, end, end + DAY, end + 5 * DAY, end + 6 * DAY]) {
      assert.equal(phase({ studentStatement, instructorStatement, nowMs }).autoReleaseAuthorized, false,
        'No combination of user declarations, silence or elapsed time may authorize payout');
    }
  }
}
console.log('PASS: VentoKite Protege deadline, claims, non-retroactive proof and no automatic payouts');
