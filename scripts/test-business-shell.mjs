import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { EMPLOYEES, INSTRUCTORS, LESSONS, PERMISSIONS, ROLES, ROLE_PERMISSIONS, UNITS } from '../src/lib/business/demo.ts';
import { can, cities, employeesInScope, findConflicts, instructorsInScope, lessonsInScope, parseScope, scopeQuery, unitsInScope, validateUnit } from '../src/lib/business/rules.ts';
import { BUSINESS_NAV } from '../src/components/business/nav.ts';

// VentoKite Business, first delivery: shell, units, staff, permissions,
// instructors and agenda. Demonstration data only; no tables, no payments.
const read = (p) => readFileSync(p, 'utf8');

// 1. Demo data is coherent.
const unitIds = new Set(UNITS.map((u) => u.id));
for (const e of EMPLOYEES) for (const a of e.assignments) assert.ok(unitIds.has(a.unitId) && ROLES.some((r) => r.id === a.role), `employee ${e.id}`);
for (const i of INSTRUCTORS) for (const id of i.unitIds) assert.ok(unitIds.has(id), `instructor ${i.id}`);
for (const l of LESSONS) assert.ok(unitIds.has(l.unitId) && INSTRUCTORS.some((i) => i.id === l.instructorId), `lesson ${l.id}`);
for (const r of ROLES) for (const p of ROLE_PERMISSIONS[r.id]) assert.ok(PERMISSIONS.some((x) => x.id === p), `${r.id} -> ${p}`);
assert.equal(ROLE_PERMISSIONS.owner.length, PERMISSIONS.length, 'owner has every permission');
for (const p of PERMISSIONS.filter((x) => x.sensitive)) assert.ok(!ROLE_PERMISSIONS.attendant.includes(p.id), `attendant lacks sensitive ${p.id}`);
assert.ok(UNITS.filter((u) => u.city === 'Jijoca de Jericoacoara').length >= 2, 'several units in one city are supported');

// 2. City/unit filter behaves the same everywhere.
const none = parseScope({});
assert.equal(unitsInScope(none).length, UNITS.length);
assert.deepEqual(parseScope({ cidade: 'Camocim' }), { cidade: 'Camocim', unidade: '' });
assert.deepEqual(parseScope({ unidade: 'u-prea', cidade: 'Camocim' }), { cidade: 'Cruz', unidade: 'u-prea' }, 'a unit wins over a mismatched city');
assert.deepEqual(parseScope({ unidade: 'hack', cidade: 'x' }), { cidade: '', unidade: '' }, 'unknown values are ignored');
assert.equal(scopeQuery(parseScope({ unidade: 'u-prea' })), '?unidade=u-prea');
assert.equal(scopeQuery(parseScope({ cidade: 'Cruz' })), '?cidade=Cruz');
assert.equal(unitsInScope(parseScope({ cidade: 'Jijoca de Jericoacoara' })).length, 2);
assert.ok(cities().length === 3);
const prea = parseScope({ unidade: 'u-prea' });
assert.ok(employeesInScope(prea).every((e) => e.assignments.some((a) => a.unitId === 'u-prea')));
assert.ok(lessonsInScope(prea).every((l) => l.unitId === 'u-prea'));
assert.ok(instructorsInScope(prea).every((i) => i.unitIds.includes('u-prea')));

// 3. Permissions are per unit.
const paula = EMPLOYEES.find((e) => e.id === 'f-2');
assert.ok(can(paula, 'u-prea', 'instr.manage'), 'manager in Preá');
assert.ok(!can(paula, 'u-jeri-centro', 'instr.manage'), 'only attendant in Jeri Centro');
assert.ok(!can(paula, 'u-camocim', 'units.view'), 'no link, no access');

// 4. One instructor, one calendar: overlap across units is a conflict.
const conflicts = findConflicts(LESSONS);
assert.deepEqual([...conflicts].sort(), ['a-1', 'a-2'], 'Rafael in Preá 09-11 and Jeri Centro 10-11');
assert.equal(findConflicts([{ id: 'x', unitId: 'u-prea', instructorId: 'i-1', service: 's', dayOffset: 0, start: '09:00', minutes: 60, origin: 'digital' }, { id: 'y', unitId: 'u-jeri-centro', instructorId: 'i-1', service: 's', dayOffset: 0, start: '10:00', minutes: 60, origin: 'digital' }]).size, 0, 'back-to-back is fine');

// 5. Unit form validation.
const ok = { name: 'Nova Unidade', city: 'Cruz', address: 'Rua A, 10', opens: '08:00', closes: '17:00', lat: '', lng: '' };
assert.deepEqual(validateUnit(ok), {});
assert.ok(validateUnit({ ...ok, name: 'ab' }).name);
assert.ok(validateUnit({ ...ok, city: '' }).city);
assert.ok(validateUnit({ ...ok, address: 'x' }).address);
assert.ok(validateUnit({ ...ok, opens: '25:00' }).opens);
assert.ok(validateUnit({ ...ok, closes: '07:00' }).closes, 'closing before opening');
assert.ok(validateUnit({ ...ok, lat: '100' }).lat);
assert.ok(validateUnit({ ...ok, lng: 'abc' }).lng);
assert.deepEqual(validateUnit({ ...ok, lat: '-2.79', lng: '-40.51' }), {});

// 6. Navigation: every entry has a page; everything is Admin-only and demo-only.
for (const item of BUSINESS_NAV) assert.ok(existsSync(join('src/app', item.href.replace(/^\//, ''), 'page.tsx')), `${item.href} has no page`);
assert.ok(BUSINESS_NAV.filter((i) => i.tab).length === 4, 'four phone tabs plus Mais');
assert.ok(existsSync('src/app/admin/business/unidades/nova/page.tsx') && existsSync('src/app/admin/business/unidades/[id]/page.tsx'));
assert.ok(existsSync('src/app/admin/business/loading.tsx'), 'loading state');
assert.match(read('src/app/admin/business/layout.tsx'), /requireRole\(\['admin'\]/, 'only the platform Admin, for now');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = [...walk('src/app/admin/business'), ...walk('src/components/business'), ...walk('src/lib/business')].filter((f) => /\.tsx?$/.test(f));
for (const f of files) {
  const s = read(f);
  assert.doesNotMatch(s, /createSupabaseServerClient|supabase\.|\.rpc\(|'use server'/, `${f}: demo screens never touch the database`);
  assert.doesNotMatch(s, /pix|checkout|estorno|repasse/i, `${f}: no payment features`);
}
const pages = files.filter((f) => f.endsWith('page.tsx') && !f.includes('/nova/') );
for (const f of pages) assert.match(read(f), /DemoBanner/, `${f} identifies demo data`);
assert.match(read('src/components/business/shell.tsx'), /aria-label=\{collapsed \? 'Expandir menu' : 'Recolher menu'\}/, 'collapsible sidebar');
console.log('PASS: Business shell: coherent demo data, shared city/unit filter, per-unit permissions, unified-agenda conflicts, unit validation, admin-only and no database or payments');
