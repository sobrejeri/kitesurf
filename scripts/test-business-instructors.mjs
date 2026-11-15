import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { AVAILABILITY, INSTRUCTORS, INSTRUCTOR_RATE_VERSIONS, LESSON_HISTORY, LESSON_REQUESTS } from '../src/lib/business/demo.ts';
import { busyOf, eligibleInstructors, freeStarts, historyInScope, instructorRateAt, isFree, parsePercentToBps, performanceOf, queueFor, suggestions, validateAssignment, validateAvailability, validateInstructorInvite, validateInstructorRate, validateResponse, weekdayOf } from '../src/lib/business/instructors.ts';
import { BUSINESS_NAV } from '../src/components/business/nav.ts';

// Business block 3 (rest): invitations, unified availability, distribution, internal queue, history, performance.
const read = (p) => readFileSync(p, 'utf8');
const ctx = { weekday0: 1, nowMinutes: 0 }; // fixed "today" = Monday
const req = (id) => LESSON_REQUESTS.find((r) => r.id === id);

// 1. One calendar: window, lessons here, in-person bookings and OTHER companies' time all block.
assert.equal(weekdayOf(ctx, 0), 1); assert.equal(weekdayOf(ctx, 1), 2); assert.equal(weekdayOf(ctx, -1), 0, 'negative offsets wrap');
assert.ok(isFree('i-1', 0, '13:00', 60, ctx)); assert.ok(!isFree('i-1', 0, '09:00', 60, ctx), 'a lesson in Preá blocks Jeri too');
assert.ok(!isFree('i-1', 0, '06:00', 60, ctx), 'outside the window'); assert.ok(!isFree('i-1', 0, '16:30', 60, ctx), 'spills past the window end');
assert.ok(!isFree('i-1', 1, '11:00', 60, ctx), 'another company occupies it'); assert.ok(isFree('i-1', 1, '12:00', 60, ctx), 'right after is fine');
assert.deepEqual(busyOf('i-1', 1), [{ start: '11:00', minutes: 60, kind: 'other' }], 'another company shows only as "other": no booking details');
for (const b of busyOf('i-1', 1)) assert.deepEqual(Object.keys(b).sort(), ['kind', 'minutes', 'start'], 'nothing private leaks');
assert.ok(!isFree('i-3', 1, '10:00', 60, ctx), 'an in-person booking blocks too'); assert.ok(!isFree('i-3', 0, '09:00', 60, ctx), 'i-3 does not work Mondays');
assert.ok(!isFree('i-4', 1, '10:00', 60, ctx), 'no windows, no availability');
assert.deepEqual(freeStarts('i-3', 1, 120, ctx), ['11:00', '11:30', '12:00']);
assert.ok(freeStarts('i-1', 1, 60, ctx).includes('10:00') && !freeStarts('i-1', 1, 60, ctx).includes('11:00') && !freeStarts('i-1', 1, 60, ctx).includes('10:30'), 'a 1 h lesson at 10:30 would clash with 11:00');
for (const w of AVAILABILITY) assert.ok(w.from < w.to && w.weekday >= 0 && w.weekday <= 6);

// 2. Distribution: link, service and free time, ordered by the internal queue.
assert.deepEqual(eligibleInstructors(req('rq-1'), ctx).sort(), ['i-1', 'i-3']); assert.deepEqual(suggestions(req('rq-1'), ctx), ['i-3', 'i-1'], 'fewer recent lessons first');
assert.deepEqual(suggestions(req('rq-2'), ctx), ['i-2']); assert.deepEqual(suggestions(req('rq-3'), ctx), [], 'nobody free: no suggestion');
assert.deepEqual(eligibleInstructors({ ...req('rq-1'), unitId: 'u-camocim' }, ctx), [], 'inactive unit'); assert.deepEqual(eligibleInstructors({ ...req('rq-1'), serviceId: 'zz' }, ctx), []);
assert.ok(!eligibleInstructors(req('rq-2'), ctx).includes('i-5'), 'suspended link receives nothing'); assert.ok(!eligibleInstructors({ ...req('rq-2'), unitId: 'u-prea', serviceId: 's-int' }, ctx).includes('i-2'), 'no link to the unit');
assert.deepEqual(validateAssignment({ requestId: 'rq-1', instructorId: 'i-3' }, ctx), {}); assert.ok(validateAssignment({ requestId: 'rq-1', instructorId: 'i-2' }, ctx).instructorId); assert.ok(validateAssignment({ requestId: 'rq-1', instructorId: 'i-5' }, ctx).instructorId); assert.ok(validateAssignment({ requestId: 'zz', instructorId: 'i-1' }, ctx).requestId);

// 3. Internal queue.
assert.deepEqual(queueFor('u-prea').map((q) => [q.instructorId, q.recent]), [['i-3', 1], ['i-1', 3]]); assert.deepEqual(queueFor('u-jeri-centro').map((q) => q.instructorId), ['i-2', 'i-1']);
assert.ok(!queueFor('u-prea').some((q) => q.instructorId === 'i-5'), 'suspended is not in the queue'); assert.ok(!queueFor('u-jeri-lagoa').some((q) => q.instructorId === 'i-4'), 'a pending invite is not in the queue');
assert.equal(queueFor('u-prea').find((q) => q.instructorId === 'i-3').vento, false); assert.equal(queueFor('u-prea').find((q) => q.instructorId === 'i-1').vento, true);

// 4. Individual commission: versioned, never retroactive; the unit's own version wins.
assert.equal(instructorRateAt('i-1', 'u-prea', -70), 5500); assert.equal(instructorRateAt('i-1', 'u-prea', 0), 6000); assert.equal(instructorRateAt('i-1', 'u-jeri-centro', 0), 6500); assert.equal(instructorRateAt('i-1', 'u-jeri-centro', -30), 6000);
assert.equal(instructorRateAt('i-1', 'u-prea', -400), 0, 'no version yet');
const before = LESSON_HISTORY.map((h) => instructorRateAt(h.instructorId, h.unitId, h.dayOffset));
const changed = [...INSTRUCTOR_RATE_VERSIONS, { id: 'x', instructorId: 'i-1', unitId: 'all', bps: 9000, fromOffset: 0 }];
assert.deepEqual(LESSON_HISTORY.map((h) => instructorRateAt(h.instructorId, h.unitId, h.dayOffset, changed)), before, 'a new version never rewrites past lessons');
assert.equal(instructorRateAt('i-1', 'u-prea', 0, changed), 9000);
for (const h of LESSON_HISTORY) assert.equal(h.commissionBps, instructorRateAt(h.instructorId, h.unitId, h.dayOffset), `${h.id}: the frozen commission is the one in force that day`);
assert.deepEqual(validateInstructorRate({ instructorId: 'i-1', scope: 'u-prea', percent: '62,5' }), {}); assert.ok(validateInstructorRate({ instructorId: 'i-1', scope: 'all', percent: '60' }).percent, 'same as in force');
assert.ok(validateInstructorRate({ instructorId: 'i-1', scope: 'u-jeri-lagoa', percent: '60' }).scope, 'a unit that is not theirs'); assert.ok(validateInstructorRate({ instructorId: 'i-1', scope: 'all', percent: '95' }).percent && validateInstructorRate({ instructorId: 'i-1', scope: 'all', percent: '5' }).percent && validateInstructorRate({ instructorId: 'zz', scope: 'all', percent: '60' }).instructorId);
assert.equal(parsePercentToBps('62,5'), 6250);

// 5. Invites and responses.
const invite = { name: 'Novo Instrutor', email: 'novo@instrutores.example', unitIds: ['u-prea'], percent: '55' };
assert.deepEqual(validateInstructorInvite(invite), {}); assert.ok(validateInstructorInvite({ ...invite, email: 'caio@instrutores.example' }).email, 'a pending invite already exists'); assert.deepEqual(validateInstructorInvite({ ...invite, email: 'heitor@instrutores.example' }), {}, 'an expired invite does not block a new one');
assert.ok(validateInstructorInvite({ ...invite, unitIds: [] }).unitIds && validateInstructorInvite({ ...invite, unitIds: ['u-camocim'] }).unitIds && validateInstructorInvite({ ...invite, percent: '99' }).percent && validateInstructorInvite({ ...invite, name: 'A' }).name && validateInstructorInvite({ ...invite, email: 'x' }).email);
assert.deepEqual(validateResponse({ decision: 'accept', reason: '' }), {}); assert.deepEqual(validateResponse({ decision: 'decline', reason: '' }), {}, 'declining needs no reason'); assert.ok(validateResponse({ decision: 'decline', reason: 'x'.repeat(141) }).reason); assert.ok(validateResponse({ decision: '', reason: '' }).decision);
assert.deepEqual(validateAvailability({ weekday: '2', from: '08:00', to: '16:30' }), {}); assert.ok(validateAvailability({ weekday: '', from: '08:00', to: '16:00' }).weekday && validateAvailability({ weekday: '9', from: '08:00', to: '16:00' }).weekday);
assert.ok(validateAvailability({ weekday: '2', from: '08:15', to: '16:00' }).from); assert.ok(validateAvailability({ weekday: '2', from: '16:00', to: '08:00' }).to); assert.ok(validateAvailability({ weekday: '2', from: '08:00', to: '08:30' }).to);

// 6. History and performance.
const all = new Set(['u-prea', 'u-jeri-centro', 'u-jeri-lagoa']);
assert.equal(historyInScope(all).length, LESSON_HISTORY.length); assert.deepEqual(historyInScope(all).map((h) => h.dayOffset), [...historyInScope(all).map((h) => h.dayOffset)].sort((a, b) => b - a), 'newest first');
assert.equal(historyInScope(all, 'i-1').length, 4); assert.equal(historyInScope(all, '', 'cancelled').length, 2); assert.equal(historyInScope(new Set(['u-jeri-lagoa'])).length, 1);
const p1 = performanceOf('i-1', LESSON_HISTORY); assert.deepEqual([p1.done, p1.cancelled, p1.noShow, p1.completionBps, p1.minutes, p1.baseCents, p1.commissionCents], [3, 1, 0, 7500, 360, 80000, 49400]);
const p2 = performanceOf('i-2', LESSON_HISTORY); assert.deepEqual([p2.done, p2.noShow, p2.baseCents, p2.commissionCents], [2, 1, 44500, 24475]); assert.equal(performanceOf('i-4', LESSON_HISTORY).completionBps, 0, 'no lessons, no division by zero');
for (const i of INSTRUCTORS) { const p = performanceOf(i.id, LESSON_HISTORY); assert.ok(p.commissionCents <= p.baseCents && Number.isInteger(p.commissionCents)); }
const prea = performanceOf('i-1', historyInScope(new Set(['u-prea'])));
assert.equal(prea.done, 2, 'the unit filter narrows what each instructor shows'); assert.equal(prea.baseCents, 52000);

// 7. Honesty and safety guards.
const B = 'src/app/admin/business/instrutores';
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const pages = ['page.tsx', 'convidar/page.tsx', 'vinculo/page.tsx', '[id]/page.tsx', '[id]/comissao/page.tsx', 'disponibilidade/page.tsx', 'distribuicao/page.tsx', 'fila/page.tsx', 'historico/page.tsx', 'desempenho/page.tsx'].map((p) => `${B}/${p}`);
const files = [...pages, 'src/lib/business/instructors.ts', 'src/components/business/instructor-forms.tsx'];
for (const f of files) {
  assert.ok(existsSync(f), f); const s = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.ok(!/service_role|supabase|createClient|fetch\(|process\.env/.test(s), `${f}: no database, secrets or network`);
  assert.ok(!/toFixed|parseFloat/.test(s), `${f}: no floating-point money`);
  assert.ok(!/'paid'|markPaid|createPayment|payout|transfer\(|stripe|checkout/i.test(s), `${f}: no payment machinery`);
}
for (const f of pages) assert.match(read(f), /<DemoBanner \/>/, `${f}: demo banner`);
assert.match(read(`${B}/vinculo/page.tsx`), /não o bloqueia|continua ativo no VentoKite/, 'suspension is not a global ban');
assert.match(read(`${B}/[id]/page.tsx`), /A suspensão vale só aqui/); assert.match(read(`${B}/disponibilidade/page.tsx`), /só como “ocupado”/);
assert.match(read(`${B}/[id]/comissao/page.tsx`), /sem efeito retroativo/); assert.match(read('src/components/business/instructor-forms.tsx'), /mantêm a comissão da época/);
assert.match(read('src/app/admin/business/layout.tsx'), /requireRole\(\['admin'\]/);
for (const href of ['/admin/business/instrutores/disponibilidade', '/admin/business/instrutores/desempenho']) assert.ok(BUSINESS_NAV.some((n) => n.href === href), href);

console.log('PASS: business instructors (unified calendar, queue, frozen individual commission, no cross-company leak)');
