import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { AUDIT_LOG, EMPLOYEES, PERMISSIONS, PRODUCTS, UNITS } from '../src/lib/business/demo.ts';
import { agoLabel, auditInScope, consolidatedRows, effectivePermissions, employeeById, formatCnpj, hasPermission, isOwner, isValidCnpj, normalizeCnpj, unitsVisibleTo, validateCompany, validateInvite, validateLink, validateRole, validateUnlink } from '../src/lib/business/company.ts';
import { totalStock } from '../src/lib/business/stock.ts';
import { parseScope } from '../src/lib/business/rules.ts';
import { BUSINESS_NAV } from '../src/components/business/nav.ts';

// Business blocks 1 and 2 (rest): company registration, consolidated view, staff, links, roles and audit.
const read = (p) => readFileSync(p, 'utf8');
const emp = (id) => employeeById(id);

// 1. CNPJ: numeric and alphanumeric, with check digits (same rule as the database test).
assert.ok(isValidCnpj('11.222.333/0001-81')); assert.ok(isValidCnpj('12ABC34501DE35')); assert.ok(isValidCnpj(' 12.abc.345/01de-35 '));
assert.ok(!isValidCnpj('12ABC34501DE36')); assert.ok(!isValidCnpj('11222333000182')); assert.ok(!isValidCnpj('00000000000000')); assert.ok(!isValidCnpj('1122233300018')); assert.ok(!isValidCnpj('abc'));
assert.equal(normalizeCnpj('11.222.333/0001-81'), '11222333000181'); assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81');
const company = { legalName: 'Ventos Novos Escola Ltda', tradeName: 'Ventos Novos', cnpj: '11.222.333/0001-81', ownerName: 'Ana Souza', email: 'ana@ventosnovos.example', phone: '(88) 99999-0000', city: 'Cruz', terms: 'yes' };
assert.deepEqual(validateCompany(company, true), {});
assert.ok(validateCompany({ ...company, cnpj: '11222333000182' }, true).cnpj); assert.ok(validateCompany({ ...company, terms: '' }, true).terms); assert.deepEqual(validateCompany({ ...company, terms: '' }, false), {});
assert.ok(validateCompany({ ...company, email: 'x' }, true).email && validateCompany({ ...company, phone: '12' }, true).phone && validateCompany({ ...company, legalName: 'A' }, true).legalName);

// 2. Permissions: role, then this person's exceptions in this unit; no link, no permissions.
assert.equal(effectivePermissions(emp('f-2'), 'u-prea').length, 10, 'manager (9) + cash.close');
assert.ok(hasPermission(emp('f-2'), 'u-prea', 'cash.close')); assert.ok(!hasPermission(emp('f-2'), 'u-jeri-centro', 'cash.close'), 'same person, other unit, no extra');
assert.equal(effectivePermissions(emp('f-2'), 'u-jeri-centro').length, 5, 'attendant there');
assert.equal(effectivePermissions(emp('f-3'), 'u-jeri-lagoa').length, 8, 'manager minus agenda.edit'); assert.ok(!hasPermission(emp('f-3'), 'u-jeri-lagoa', 'agenda.edit')); assert.ok(hasPermission(emp('f-3'), 'u-jeri-centro', 'agenda.edit'), 'the cut is only in that unit');
assert.deepEqual(effectivePermissions(emp('f-5'), 'u-jeri-centro'), [], 'no link, no permissions');
for (const u of UNITS) assert.equal(effectivePermissions(emp('f-1'), u.id).length, PERMISSIONS.length, 'the owner has everything everywhere');
assert.ok(isOwner(emp('f-1')) && !isOwner(emp('f-2')));

// 3. Visibility: employees see only their units; the owner sees all.
assert.deepEqual(unitsVisibleTo(emp('f-2')).map((u) => u.id), ['u-prea', 'u-jeri-centro']); assert.deepEqual(unitsVisibleTo(emp('f-6')).map((u) => u.id), ['u-jeri-lagoa']);
assert.equal(unitsVisibleTo(emp('f-1')).length, UNITS.length); assert.deepEqual(unitsVisibleTo(undefined), []);
for (const e of EMPLOYEES) for (const u of unitsVisibleTo(e)) assert.ok(e.assignments.some((a) => a.unitId === u.id));
const rows = consolidatedRows(UNITS);
assert.equal(rows.length, UNITS.length); assert.deepEqual(rows.map((r) => r.staff), [4, 4, 4, 2]); assert.deepEqual(rows.map((r) => r.instructors), [2, 2, 1, 0], 'suspended and invited instructors do not count');
assert.equal(rows.reduce((n, r) => n + r.stockUnits, 0), PRODUCTS.reduce((n, p) => n + totalStock(p.id, parseScope({})), 0), 'the consolidated stock equals the stock ledger');
assert.equal(consolidatedRows(unitsVisibleTo(emp('f-6'))).length, 1, 'a restricted employee gets one row');

// 4. Invites and links.
const invite = { name: 'Nova Pessoa', email: 'nova@ventosdonorte.example', links: [{ unitId: 'u-prea', role: 'attendant' }, { unitId: 'u-jeri-centro', role: 'finance' }] };
assert.deepEqual(validateInvite(invite), {});
assert.ok(validateInvite({ ...invite, email: 'paula@ventosdonorte.example' }).email, 'duplicate e-mail'); assert.ok(validateInvite({ ...invite, email: 'x' }).email);
assert.ok(validateInvite({ ...invite, links: [] }).links); assert.ok(validateInvite({ ...invite, links: [{ unitId: 'u-camocim', role: 'attendant' }] }).links, 'inactive unit');
assert.match(validateInvite({ ...invite, links: [{ unitId: 'u-prea', role: 'owner' }] }).links, /Proprietário/, 'nobody becomes owner by invite');
assert.ok(validateInvite({ ...invite, links: [{ unitId: 'u-prea', role: 'admin' }] }).links, 'the platform admin role does not exist here');
assert.deepEqual(validateLink({ employeeId: 'f-2', unitId: 'u-jeri-lagoa', role: 'finance' }), {});
assert.ok(validateLink({ employeeId: 'f-2', unitId: 'u-prea', role: 'finance' }).unitId, 'already linked'); assert.ok(validateLink({ employeeId: 'f-2', unitId: 'u-jeri-lagoa', role: 'owner' }).role); assert.ok(validateLink({ employeeId: 'zz', unitId: 'u-prea', role: 'finance' }).employeeId);
assert.equal(validateUnlink('f-5', 'u-prea'), null); assert.equal(validateUnlink('f-2', 'u-prea'), null, 'the owner keeps the unit managed');
assert.match(validateUnlink('f-1', 'u-prea'), /Proprietário/); assert.equal(validateUnlink('f-5', 'u-jeri-lagoa'), 'Vínculo não encontrado.');

// 5. Roles.
const role = { name: 'Supervisor', base: 'manager', permissions: ['agenda.view', 'agenda.edit'], confirmSensitive: false };
assert.deepEqual(validateRole(role), {});
assert.ok(validateRole({ ...role, permissions: ['perm.edit'] }).confirmSensitive, 'sensitive needs confirmation'); assert.deepEqual(validateRole({ ...role, permissions: ['perm.edit'], confirmSensitive: true }), {});
assert.ok(validateRole({ ...role, name: 'gerente' }).name, 'duplicate name'); assert.ok(validateRole({ ...role, base: 'owner' }).base); assert.ok(validateRole({ ...role, permissions: [] }).permissions); assert.ok(validateRole({ ...role, permissions: ['x'] }).permissions);

// 6. Audit: scoped, filterable, newest first.
assert.equal(auditInScope(new Set(UNITS.map((u) => u.id))).length, AUDIT_LOG.length);
const sorted = auditInScope(new Set(UNITS.map((u) => u.id))).map((a) => a.minutesAgo); assert.deepEqual(sorted, [...sorted].sort((a, b) => a - b));
assert.deepEqual(auditInScope(new Set(['u-jeri-lagoa'])).map((a) => a.id), ['au-3', 'au-6', 'au-5'].sort((a, b) => AUDIT_LOG.find((x) => x.id === a).minutesAgo - AUDIT_LOG.find((x) => x.id === b).minutesAgo), 'one unit plus company-wide entries');
assert.equal(auditInScope(new Set(UNITS.map((u) => u.id)), 'perm.change').length, 2); assert.equal(auditInScope(new Set(UNITS.map((u) => u.id)), '', 'f-1').length, 4);
assert.equal(new Set(AUDIT_LOG.map((a) => a.id)).size, AUDIT_LOG.length); assert.equal(agoLabel(35), 'há 35 min'); assert.equal(agoLabel(600), 'há 10 h'); assert.equal(agoLabel(2900), 'há 2 dia(s)');

// 7. Honesty and safety guards.
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const B = 'src/app/admin/business';
const pageFiles = [`${B}/empresa/page.tsx`, `${B}/empresa/cadastro/page.tsx`, `${B}/consolidado/page.tsx`, `${B}/cargos/page.tsx`, `${B}/auditoria/page.tsx`, `${B}/funcionarios/convidar/page.tsx`, `${B}/funcionarios/vinculos/page.tsx`, `${B}/funcionarios/[id]/page.tsx`];
const files = [...pageFiles, 'src/lib/business/company.ts', 'src/components/business/company-forms.tsx', 'src/components/business/company-kit.tsx'];
for (const f of files) {
  assert.ok(existsSync(f), f);
  const s = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.ok(!/service_role|supabase|createClient|fetch\(|process\.env/.test(s), `${f}: no database, secrets or network`);
  assert.ok(!/'admin'|"admin"|role:\s*'admin/.test(s), `${f}: never hands out the platform admin role`);
}
for (const f of pageFiles) assert.match(read(f), /<DemoBanner \/>/, `${f}: demo banner`);
assert.match(read('src/components/business/company-forms.tsx'), /Ninguém recebe papel de administrador da plataforma/);
assert.match(read(`${B}/auditoria/page.tsx`), /não podem ser editados nem apagados/);
assert.match(read(`${B}/consolidado/page.tsx`), /o banco filtra, não a tela/, 'says enforcement belongs to the database');
assert.ok(!/delete|remove|splice/i.test(read(`${B}/auditoria/page.tsx`).replace(/não podem ser editados nem apagados/, '')), 'the audit screen has no way to change entries');
assert.match(read(`${B}/layout.tsx`), /requireRole\(\['admin'\]/);
for (const href of ['/admin/business/empresa', '/admin/business/consolidado', '/admin/business/cargos', '/admin/business/auditoria']) assert.ok(BUSINESS_NAV.some((n) => n.href === href), href);
assert.ok(walk(B).filter((f) => f.endsWith('page.tsx')).length >= 40);

console.log('PASS: business company and staff (CNPJ, per-unit permissions, visibility, links, roles, append-only audit)');
