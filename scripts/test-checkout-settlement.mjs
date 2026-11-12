import assert from 'node:assert/strict'
import { settlementEligibility } from '../src/lib/checkout-settlement.ts'

const completed = {
  payment: 'approved',
  booking: 'completed',
  chargedMeetings: ['completed', 'completed'],
  openIncident: false,
  releaseAuthorized: true,
}

assert.equal(settlementEligibility(completed), 'eligible')
for (const payment of ['pending', 'failed', 'refunded', 'disputed']) {
  assert.equal(settlementEligibility({ ...completed, payment }), 'payment_not_approved')
}
assert.equal(settlementEligibility({ ...completed, openIncident: true }), 'incident_open')
assert.equal(settlementEligibility({ ...completed, booking: 'cancelled' }), 'booking_not_completed')
for (const chargedMeetings of [[], ['completed', 'pending'], ['completed', 'cancelled']]) {
  assert.equal(settlementEligibility({ ...completed, chargedMeetings }), 'meetings_not_completed')
}
assert.equal(settlementEligibility({ ...completed, releaseAuthorized: false }), 'authorization_required')
