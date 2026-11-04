import assert from 'node:assert/strict';
import { adminAgendaRange } from '../src/lib/admin-agenda-range.ts';
assert.deepEqual(adminAgendaRange('2026-11-04','day'),{
 startsAt:'2026-11-04T00:00:00-03:00',endsAt:'2026-11-05T00:00:00-03:00',previousDate:'2026-11-03',nextDate:'2026-11-05',
});
assert.equal(adminAgendaRange('2026-11-04','week').startsAt,'2026-11-01T00:00:00-03:00');
assert.equal(adminAgendaRange('2026-11-04','week').endsAt,'2026-11-08T00:00:00-03:00');
assert.equal(adminAgendaRange('2026-12-31','month').endsAt,'2027-01-01T00:00:00-03:00');
assert.equal(adminAgendaRange('2028-02-29','month').endsAt,'2028-03-01T00:00:00-03:00');
assert.throws(()=>adminAgendaRange('2026-02-30','day'));
assert.throws(()=>adminAgendaRange('not-a-date','week'));
console.log('PASS: admin day/week/month agenda uses Ceará boundaries, leap dates and year transitions');
