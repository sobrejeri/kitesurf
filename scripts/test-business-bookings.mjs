import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { EXTERNAL_BOOKINGS, INSTRUCTORS, LESSONS, UNITS, UNIT_SERVICES } from '../src/lib/business/demo.ts';
import { availableSlots, bookingPrice, currentContext, validateBooking } from '../src/lib/business/bookings.ts';
import { BUSINESS_NAV } from '../src/components/business/nav.ts';

// Business block 10: in-person bookings share the digital agenda rules. Demo data only.
// Monday 12:30 in Fortaleza (UTC-3) as the fixed "now".
const ctx = currentContext(new Date('2026-11-16T15:30:00Z'));
assert.deepEqual(ctx, { weekday0: 1, nowMinutes: 750 }, 'Fortaleza time, Monday 12:30');
const ctxMorning = { weekday0: 1, nowMinutes: 600 };

// 1. Demo data coherence: PRE- origin, valid references, effective price, no double booking.
for (const b of EXTERNAL_BOOKINGS) {
  assert.match(b.code, /^PRE-\d{4}$/, 'origin is in the code');
  const config = UNIT_SERVICES.find((u) => u.unitId === b.unitId && u.serviceId === b.serviceId);
  assert.ok(config && config.instructorIds.includes(b.instructorId), `${b.id} is enabled for that unit and instructor`);
  assert.equal(b.priceCents, bookingPrice(b.unitId, b.serviceId), `${b.id} uses the unit price`);
  assert.ok(INSTRUCTORS.find((i) => i.id === b.instructorId)?.status === 'active');
}
const live = EXTERNAL_BOOKINGS.filter((b) => b.status !== 'cancelled');
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const all = [...LESSONS, ...live];
// (a-1/a-2 is the deliberate conflict of the agenda demo; only pairs with an in-person booking are checked)
for (const [i, a] of all.entries()) for (const b of all.slice(i + 1)) {
  if (!live.includes(a) && !live.includes(b)) continue;
  if (a.instructorId === b.instructorId && a.dayOffset === b.dayOffset) {
    assert.ok(!(toMin(a.start) < toMin(b.start) + b.minutes && toMin(b.start) < toMin(a.start) + a.minutes), `demo overlap ${a.id}/${b.id}`);
  }
}

// 2. Slots follow unit hours, weekday, service length and the notice rule.
const prea = { unitId: 'u-prea', serviceId: 's-ini', instructorId: 'i-1' };
const day1 = availableSlots({ ...prea, dayOffset: 1 }, ctx);
assert.equal(day1[0], '07:00'); assert.equal(day1.at(-1), '15:00', '120 min must end by 17:00'); assert.equal(day1.length, 17);
const today = availableSlots({ ...prea, dayOffset: 0 }, ctxMorning);
assert.equal(today[0], '11:00', 'at least 1 h ahead and after the instructor\'s lesson that ends at 11:00');
assert.deepEqual(availableSlots({ ...prea, dayOffset: -1 }, ctx), [], 'no past days');
assert.deepEqual(availableSlots({ ...prea, dayOffset: 31 }, ctx), [], 'no far future');
assert.deepEqual(availableSlots({ unitId: 'u-jeri-lagoa', serviceId: 's-ini', instructorId: 'i-2', dayOffset: 1 }, ctx), [], 'Lagoa does not serve on Tuesday');
assert.ok(availableSlots({ unitId: 'u-jeri-lagoa', serviceId: 's-ini', instructorId: 'i-2', dayOffset: 2 }, ctx).length > 0, 'but serves on Wednesday');
assert.deepEqual(availableSlots({ unitId: 'u-camocim', serviceId: 's-ini', instructorId: 'i-1', dayOffset: 1 }, ctx), [], 'inactive unit');
assert.deepEqual(availableSlots({ ...prea, instructorId: 'i-2', dayOffset: 1 }, ctx), [], 'instructor not linked to this service and unit');

// 3. One instructor, one calendar: a lesson in another unit blocks the slot.
const jeri = availableSlots({ unitId: 'u-jeri-centro', serviceId: 's-ini', instructorId: 'i-1', dayOffset: 0 }, ctxMorning);
assert.equal(jeri[0], '11:00', 'Rafael teaches in Preá 09-11 and Jeri Centro 10-11');

// 4. Existing in-person bookings block; cancelled ones do not; changing ignores the booking itself.
const e1 = { unitId: 'u-jeri-centro', serviceId: 's-ini', instructorId: 'i-2', dayOffset: 2 };
assert.ok(!availableSlots(e1, ctx).includes('09:00') && !availableSlots(e1, ctx).includes('10:00'), 'PRE-0001 holds 09-11');
assert.ok(availableSlots({ ...e1, ignoreBookingId: 'e-1' }, ctx).includes('09:00'), 'its own slot is free when changing it');
assert.ok(availableSlots({ unitId: 'u-jeri-centro', serviceId: 's-int', instructorId: 'i-2', dayOffset: 1 }, ctx).includes('14:00'), 'PRE-0005 was cancelled');

// 5. Validation.
const ok = { ...prea, dayOffset: 1, start: '09:00', name: 'Cliente Teste', phone: '(88) 99999-9999' };
assert.deepEqual(validateBooking(ok, ctx), {});
assert.ok(validateBooking({ ...ok, start: '06:00' }, ctx).start, 'outside opening hours');
assert.ok(validateBooking({ ...ok, start: '' }, ctx).start);
assert.ok(validateBooking({ ...ok, instructorId: 'i-2' }, ctx).instructorId);
assert.ok(validateBooking({ ...ok, unitId: 'u-jeri-centro', serviceId: 's-ava' }, ctx).serviceId, 'service not enabled in the unit');
assert.ok(validateBooking({ ...ok, unitId: 'u-camocim' }, ctx).unitId);
assert.ok(validateBooking({ ...ok, name: 'Jo' }, ctx).name);
for (const phone of ['123', '', '1234567890123456']) assert.ok(validateBooking({ ...ok, phone }, ctx).phone, `phone ${phone}`);
assert.equal(bookingPrice('u-jeri-centro', 's-ini'), 28000);
assert.equal(bookingPrice('u-prea', 's-ini'), 26000);
assert.equal(bookingPrice('u-prea', 'nada'), 0);

// 6. Navigation and screens.
assert.ok(BUSINESS_NAV.some((i) => i.href === '/admin/business/reservas'));
for (const p of ['reservas', 'reservas/nova', 'reservas/[id]', 'reservas/[id]/comprovante']) assert.ok(existsSync(`src/app/admin/business/${p}/page.tsx`), p);
assert.ok(existsSync('src/components/business/confirm-dialog.tsx') && existsSync('src/components/business/booking-wizard.tsx'));
assert.ok(UNITS.length > 0);
console.log('PASS: Business in-person bookings: Fortaleza time, unit hours and weekdays, unified instructor agenda, cancelled slots free, validation');
