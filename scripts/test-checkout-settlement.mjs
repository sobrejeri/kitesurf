import assert from 'node:assert/strict'
import { buildCheckoutSplit, settlementEligibility } from '../src/lib/checkout-settlement.ts'

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

assert.deepEqual(buildCheckoutSplit({ totalCents: 10001, platformCents: 1000, affiliateCents: 2000 }), [
  { role: 'instructor', amountCents: 7001 },
  { role: 'platform', amountCents: 1000 },
  { role: 'affiliate', amountCents: 2000 },
])
assert.deepEqual(buildCheckoutSplit({ totalCents: 10000, platformCents: 1000 }), [
  { role: 'instructor', amountCents: 9000 },
  { role: 'platform', amountCents: 1000 },
])
for (const amounts of [
  { totalCents: 10000, platformCents: 8000, affiliateCents: 2000 },
  { totalCents: 10000, platformCents: 8001, affiliateCents: 2000 },
  { totalCents: 10000, platformCents: 0 },
  { totalCents: 10000, platformCents: 1000, affiliateCents: -1 },
  { totalCents: 10000, platformCents: 0.5 },
  { totalCents: Number.MAX_SAFE_INTEGER + 1, platformCents: 1000 },
]) {
  assert.throws(() => buildCheckoutSplit(amounts), RangeError)
}
