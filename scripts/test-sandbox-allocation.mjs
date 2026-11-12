import assert from 'node:assert/strict';
import { allocateSandboxBooking as allocate } from '../src/lib/sandbox-allocation.mjs';

const scenarios = [
  [{ grossCents: 45000, platformBps: 1500 }, { grossCents: 45000, platformCents: 6750, affiliateCents: 0, instructorCents: 38250 }],
  [{ grossCents: 45000, platformBps: 1500, affiliateBps: 500, affiliateEligible: true },
    { grossCents: 45000, platformCents: 6750, affiliateCents: 2250, instructorCents: 36000 }],
  [{ grossCents: 1, platformBps: 5000, affiliateBps: 5000, affiliateEligible: true },
    { grossCents: 1, platformCents: 1, affiliateCents: 0, instructorCents: 0 }],
  [{ grossCents: 0, platformBps: 1500 }, { grossCents: 0, platformCents: 0, affiliateCents: 0, instructorCents: 0 }],
];
for (const [input, expected] of scenarios) assert.deepEqual(allocate(input), expected);
for (const grossCents of [1, 2, 3, 7, 101, 10001, 45000, 999999]) {
  for (let platformBps = 0; platformBps <= 10000; platformBps += 137) {
    const affiliateBps = Math.min(1500, 10000 - platformBps);
    const a = allocate({ grossCents, platformBps, affiliateBps, affiliateEligible: true });
    assert.equal(a.platformCents + a.affiliateCents + a.instructorCents, grossCents);
    assert.ok(Object.values(a).every(Number.isSafeInteger));
    assert.ok(Object.values(a).every(v => v >= 0));
  }
}
for (const invalid of [
  { grossCents: -1, platformBps: 0 }, { grossCents: 1.5, platformBps: 0 },
  { grossCents: Number.MAX_SAFE_INTEGER + 1, platformBps: 0 },
  { grossCents: 100, platformBps: 10001 },
  { grossCents: 100, platformBps: 9000, affiliateBps: 2000, affiliateEligible: true },
  { grossCents: 100, platformBps: 100, affiliateBps: 100, affiliateEligible: false },
]) assert.throws(() => allocate(invalid));
console.log('Sandbox integer-cent allocation regression passed');
