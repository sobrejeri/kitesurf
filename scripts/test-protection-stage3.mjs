import assert from 'node:assert/strict';
import {
  claimedMinutesValid, protectionStage3Enabled,
  PROTECTION_DECLARATIONS, PROTECTION_ASSESSMENTS,
} from '../src/lib/protection-stage3.ts';

assert.equal(protectionStage3Enabled(), false, 'Stage 3B remains disabled without explicit server flag');
assert.deepEqual(Object.keys(PROTECTION_DECLARATIONS),[
  'delivered','partially_delivered','not_delivered','student_absent','weather_or_safety',
]);
assert.deepEqual(Object.keys(PROTECTION_ASSESSMENTS),[
  'request_more_evidence','disputed','suggest_reschedule',
  'refund_eligibility_review','no_financial_action',
]);
for (const minutes of [0,1,59,60,61,120,480]) {
  assert.equal(claimedMinutesValid('delivered',minutes,60),minutes===60);
  assert.equal(claimedMinutesValid('partially_delivered',minutes,60),minutes>0&&minutes<60);
  for(const code of ['not_delivered','student_absent','weather_or_safety']){
    assert.equal(claimedMinutesValid(code,minutes,60),minutes===0);
  }
}
for (const minutes of [-1,NaN,2.5,481]) {
 assert.equal(claimedMinutesValid('delivered',minutes,60),false);
}
assert.equal(claimedMinutesValid('delivered',60,0),false);
assert.equal(claimedMinutesValid('delivered',60,481),false);
console.log('PASS: Stage 3B is explicitly gated and minutes cannot contradict a declaration');
