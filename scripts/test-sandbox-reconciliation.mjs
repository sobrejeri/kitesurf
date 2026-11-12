import assert from 'node:assert/strict';
import { reconcileSandboxPayments as reconcile } from '../src/lib/sandbox-reconciliation.mjs';
const base = { method: 'pix', payoutStatus: 'not_started', grossCents: 10001 };
const result = reconcile([
  { ...base, paymentId: 'p1', status: 'pending' },
  { ...base, paymentId: 'p2', status: 'expired' },
  { ...base, paymentId: 'p3', status: 'approved' },
  { ...base, paymentId: 'p4', status: 'refunded', refundedCents: 10001 },
  { ...base, paymentId: 'c1', method: 'card', status: 'declined' },
]);
assert.equal(result.totals.count, 5);
assert.equal(result.totals.approvedCents, 20002);
assert.equal(result.totals.refundedCents, 10001);
assert.equal(result.totals.netApprovedCents, 10001);
assert.equal(result.totals.pendingCents, 10001);
assert.equal(result.totals.expiredCount, 1);
assert.equal(result.totals.declinedCount, 1);
assert.equal(result.totals.payoutReleasedCents, 0);
assert.throws(() => reconcile([{ ...base, paymentId: 'x', status: 'approved' }, { ...base, paymentId: 'x', status: 'approved' }]));
assert.throws(() => reconcile([{ ...base, paymentId: 'x', status: 'approved', payoutStatus: 'released' }]));
assert.throws(() => reconcile([{ ...base, paymentId: 'x', status: 'refunded', refundedCents: 2 }]));
assert.throws(() => reconcile([{ ...base, paymentId: 'x', status: 'pending', refundedCents: 1 }]));
assert.throws(() => reconcile([{ ...base, paymentId: 'x', status: 'approved', grossCents: 1.5 }]));
console.log('Sandbox reconciliation invariants passed');
