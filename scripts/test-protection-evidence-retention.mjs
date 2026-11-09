import assert from 'node:assert/strict';
import { assessEvidenceForManualCleanup } from '../src/lib/protection-evidence-retention.ts';

const day = 86_400_000;
const now = Date.parse('2026-11-09T22:00:00Z');
const candidate = {createdAtMs:now-31*day,confirmed:false,caseState:'resolved',legalHold:false};
assert.equal(assessEvidenceForManualCleanup(candidate,now,30).kind,'manual_review_candidate');
assert.equal(assessEvidenceForManualCleanup({...candidate,confirmed:true},now,30).kind,'retain');
assert.equal(assessEvidenceForManualCleanup({...candidate,caseState:'open'},now,30).kind,'retain');
assert.equal(assessEvidenceForManualCleanup({...candidate,caseState:'reviewing'},now,30).kind,'retain');
assert.equal(assessEvidenceForManualCleanup({...candidate,caseState:'unknown'},now,30).kind,'retain');
assert.equal(assessEvidenceForManualCleanup({...candidate,legalHold:null},now,30).kind,'retain');
assert.equal(assessEvidenceForManualCleanup({...candidate,legalHold:true},now,30).kind,'retain');
assert.equal(assessEvidenceForManualCleanup({...candidate,createdAtMs:now-29*day},now,30).kind,'retain');
assert.throws(()=>assessEvidenceForManualCleanup(candidate,now,0),RangeError);
assert.throws(()=>assessEvidenceForManualCleanup({...candidate,createdAtMs:now+day},now,30),RangeError);
assert.ok(!('delete' in assessEvidenceForManualCleanup(candidate,now,30)),
  'Classification must never carry a deletion command');
console.log('PASS: dry-run classification never auto-removes confirmed, disputed or legally held evidence');
