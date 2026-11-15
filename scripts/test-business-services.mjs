import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { INSTRUCTORS, PACKAGES, SERVICES, UNITS, UNIT_SERVICES } from '../src/lib/business/demo.ts';
import { effectivePriceCents, parseMoneyToCents, summarizePackage, unitServicesInScope, validateService } from '../src/lib/business/services.ts';
import { parseScope } from '../src/lib/business/rules.ts';
import { BUSINESS_NAV } from '../src/components/business/nav.ts';

// Business block 4: services and prices. Demonstration data; money is integer cents.
// 1. Coherent demo data: one service enabled per unit at most, only active instructors of that unit.
const seen = new Set();
for (const u of UNIT_SERVICES) {
  const key = `${u.serviceId}:${u.unitId}`;
  assert.ok(!seen.has(key), `${key} enabled twice`); seen.add(key);
  assert.ok(SERVICES.some((s) => s.id === u.serviceId) && UNITS.some((x) => x.id === u.unitId), key);
  assert.ok(u.instructorIds.length > 0 && u.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6), key);
  for (const id of u.instructorIds) {
    const i = INSTRUCTORS.find((x) => x.id === id);
    assert.ok(i && i.status === 'active' && i.unitIds.includes(u.unitId), `${key}: ${id} must be an active instructor of the unit`);
  }
  assert.ok(u.priceCents === null || Number.isInteger(u.priceCents), 'integer cents');
}
for (const s of SERVICES) assert.ok(Number.isInteger(s.baseCents) && s.minutes % 15 === 0, s.id);
assert.ok(new Set(UNIT_SERVICES.filter((u) => u.serviceId === 's-ini').map((u) => u.unitId)).size >= 3, 'one service, several units');

// 2. Money parsing never uses floats.
assert.equal(parseMoneyToCents('260,00'), 26000);
assert.equal(parseMoneyToCents('260'), 26000);
assert.equal(parseMoneyToCents('26,5'), 2650);
assert.equal(parseMoneyToCents('0,07'), 7);
assert.equal(parseMoneyToCents('1.234,56'), null, 'thousand separators are not accepted');
for (const bad of ['260,001', 'abc', '1e3', '-5', '', '12345678']) assert.equal(parseMoneyToCents(bad), null, bad);

// 3. Effective price: the unit's own price wins, otherwise the base price.
const ini = SERVICES.find((s) => s.id === 's-ini');
const at = (unitId) => UNIT_SERVICES.find((u) => u.serviceId === 's-ini' && u.unitId === unitId);
assert.equal(effectivePriceCents(ini, at('u-prea')), 26000, 'no own price -> base');
assert.equal(effectivePriceCents(ini, at('u-jeri-centro')), 28000);
assert.equal(effectivePriceCents(ini, { ...at('u-prea'), priceCents: 0 }), 26000, 'zero is not a price');

// 4. Filters.
assert.equal(unitServicesInScope(parseScope({})).length, UNIT_SERVICES.length);
assert.ok(unitServicesInScope(parseScope({ unidade: 'u-prea' })).every((u) => u.unitId === 'u-prea'));
assert.equal(unitServicesInScope(parseScope({ cidade: 'Jijoca de Jericoacoara' })).length, 3);
assert.equal(unitServicesInScope(parseScope({ unidade: 'u-camocim' })).length, 0, 'inactive unit sells nothing');

// 5. Service form validation.
const ok = { name: 'Aula nova', minutes: '90', capacity: '2', price: '150,00' };
assert.deepEqual(validateService(ok), {});
assert.ok(validateService({ ...ok, name: 'ab' }).name);
for (const m of ['20', '45.5', '500', 'x', '100']) assert.ok(validateService({ ...ok, minutes: m }).minutes, `minutes ${m}`);
for (const c of ['0', '11', '1.5']) assert.ok(validateService({ ...ok, capacity: c }).capacity, `capacity ${c}`);
for (const p of ['5,00', '150,555', 'grátis']) assert.ok(validateService({ ...ok, price: p }).price, `price ${p}`);

// 6. Packages: savings against buying lessons one by one, in cents and bps.
const [p1, p2] = PACKAGES.map(summarizePackage);
assert.deepEqual(p1, { regularCents: 130000, savingCents: 10000, perLessonCents: 24000, savingBps: 769 });
assert.deepEqual(p2, { regularCents: 45000, savingCents: 3000, perLessonCents: 14000, savingBps: 667 });
assert.equal(summarizePackage({ ...PACKAGES[0], priceCents: 999999 }).savingCents, 0, 'never a negative saving');

// 7. Navigation and the school price scope.
for (const href of ['/admin/business/servicos', '/admin/business/precos', '/admin/business/pacotes']) {
  assert.ok(BUSINESS_NAV.some((i) => i.href === href) && existsSync(`src/app${href}/page.tsx`), href);
}
assert.ok(existsSync('src/app/admin/business/servicos/novo/page.tsx') && existsSync('src/app/admin/business/servicos/[id]/page.tsx'));
console.log('PASS: Business services: integer-cent prices, unit price over base price, one service in several units, package savings and validation');
