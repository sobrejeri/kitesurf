import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { summarizePerformance } from '../src/lib/performance.ts';
import { ADMIN_NAV } from '../src/components/workspace-nav.ts';

// Admin "Indicadores": figures come from frozen booking snapshots, in integer
// cents and basis points; validation (test) bookings never count.
const meeting = (status, done = 0) => ({ id: Math.random().toString(), position: 1, starts_at: '2026-11-10T12:00:00Z', minutes: 120, status, done_minutes: done, note: null });
const booking = (o) => ({
  id: Math.random().toString(), code: 'VNT-1', status: 'confirmed', is_test: false, beach_id: 'b1', beach: { name: 'Preá' },
  total_cents: 60000, partner_cents: 0, platform_cents: 9000, instructor_net_cents: 51000, created_at: '2026-11-10T12:00:00Z',
  student_id: 's', instructor_id: 'i1', partner_id: null, booking_meetings: [], student: null, instructor: { full_name: 'Rafael' }, ...o,
});
const s = summarizePerformance([
  booking({ booking_meetings: [meeting('done', 120)], partner_id: 'p1', partner_cents: 3000 }),
  booking({ status: 'completed', total_cents: 30000, instructor_net_cents: 25500, beach: { name: 'Jeri' }, booking_meetings: [meeting('done', 90), meeting('scheduled')] }),
  booking({ status: 'cancelled', booking_meetings: [meeting('scheduled')] }),
  booking({ status: 'awaiting_payment', instructor_id: null, instructor: null }),
  booking({ is_test: true, total_cents: 999999, booking_meetings: [meeting('done', 500)] }),
]);
assert.equal(s.total, 4, 'test bookings are not counted');
assert.equal(s.closed, 2);
assert.equal(s.cancelled, 1);
assert.equal(s.awaiting, 1);
assert.equal(s.confirmationBps, 5000, '2 of 4 = 50.00%');
assert.equal(s.cancellationBps, 2500);
assert.equal(s.volumeCents, 90000);
assert.equal(s.averageTicketCents, 45000);
assert.equal(s.meetingsDone, 2, 'cancelled and test bookings do not add meetings');
assert.equal(s.meetingsOpen, 1);
assert.equal(s.minutesDone, 210);
assert.equal(s.unassigned, 1);
assert.deepEqual(s.perInstructor.map((r) => [r.bookings, r.meetingsDone, r.minutesDone, r.netCents]), [[2, 2, 210, 76500]]);
assert.deepEqual(s.perBeach.map((r) => r.name), ['Preá', 'Jeri'], 'sorted by volume');
assert.deepEqual(s.perPartner, [{ id: 'p1', bookings: 1, commissionCents: 3000 }]);
for (const value of [s.volumeCents, s.averageTicketCents, s.confirmationBps]) assert.ok(Number.isInteger(value), 'integers only');
const empty = summarizePerformance([]);
assert.equal(empty.confirmationBps, 0); assert.equal(empty.averageTicketCents, 0);

const item = ADMIN_NAV.find((entry) => entry.href === '/admin/indicadores');
assert.ok(item && existsSync('src/app/admin/(app)/indicadores/page.tsx'), 'menu entry has a page');
assert.ok(ADMIN_NAV.some((entry) => entry.href === '/admin/equipe'), 'team page is reachable from the menu');
assert.match(readFileSync('src/app/admin/(app)/indicadores/page.tsx', 'utf8'), /requireRole\(\['admin'\]/, 'admin only');
console.log('PASS: Admin indicators use frozen snapshots in integer cents/bps, skip test bookings and are admin-only');
