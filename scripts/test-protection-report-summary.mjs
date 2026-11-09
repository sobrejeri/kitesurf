import assert from 'node:assert/strict';
import { summarizeVisibleProtectionReports } from '../src/lib/protection-report-summary.ts';

const reports = [
  { meeting_id: 'meeting-a', reported_by: 'student-a', status: 'open' },
  { meeting_id: 'meeting-a', reported_by: 'instructor-a', status: 'reviewing' },
  { meeting_id: 'meeting-b', reported_by: 'instructor-a', status: 'resolved' },
];
const student = summarizeVisibleProtectionReports(reports, 'student-a');
assert.deepEqual(student['meeting-a'], {
  visibleReports: 2,
  hasViewerReport: true,
  hasOpenOrReviewingReport: true,
});
assert.deepEqual(student['meeting-b'], {
  visibleReports: 1,
  hasViewerReport: false,
  hasOpenOrReviewingReport: false,
});
assert.equal(student['meeting-not-returned'], undefined, 'No claim about records absent from limited/RLS query');
assert.equal(summarizeVisibleProtectionReports([], 'student-a')['meeting-a'], undefined);
assert.throws(() => summarizeVisibleProtectionReports([], '  '), RangeError);
const tricky = summarizeVisibleProtectionReports([
  { meeting_id: '__proto__', reported_by: 'student-a', status: 'open' },
], 'student-a');
assert.equal(Object.getPrototypeOf(tricky), null, 'Map keys cannot mutate Object.prototype');
assert.equal(tricky['__proto__'].visibleReports, 1);
console.log('PASS: visible incident summaries never infer absence, presence or payment approval');
