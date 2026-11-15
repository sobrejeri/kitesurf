import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { COMMISSION_ITEMS, EMPLOYEES, EXTERNAL_PAYMENTS, FIN_ENTRIES, PAYABLES, RECEIVABLES, UNITS } from '../src/lib/business/demo.ts';
import { byEmployee, byUnit, commissionCents, dueStatus, instructorBalance, instructorsWithLessons, payableStatus, periodSummary, receivableStatus, schoolShareCents, validateExternalPayment } from '../src/lib/business/finance.ts';
import { financePdfLines, financeSheetRows } from '../src/lib/business/report.ts';
import { parseScope } from '../src/lib/business/rules.ts';
import { BUSINESS_NAV } from '../src/components/business/nav.ts';

// Business block 7: finance. The school pays its instructors itself, outside VentoKite.
const read = (p) => readFileSync(p, 'utf8');
const all = parseScope({});

// 1. Commission: rounded once; the school keeps the rest by subtraction, so the parts always add up.
assert.equal(commissionCents(26000, 6000), 15600);
assert.equal(commissionCents(15000, 5500), 8250);
assert.equal(commissionCents(10001, 5500), 5501, 'rounded once, half up');
for (const base of [1, 99, 10001, 26000, 33333, 123457]) for (const bps of [0, 5000, 5500, 6000, 9999, 10000]) {
  assert.equal(commissionCents(base, bps) + schoolShareCents(base, bps), base, `${base}@${bps}`);
  assert.ok(Number.isInteger(commissionCents(base, bps)));
}

// 2. The percentage is frozen on each lesson (a raise never rewrites old lessons).
const i3 = COMMISSION_ITEMS.filter((c) => c.instructorId === 'i-3');
assert.deepEqual(new Set(i3.map((c) => c.commissionBps)), new Set([5500, 6000]), 'same instructor, two rates over time');
assert.equal(instructorBalance('i-3').dueCents, 14300 + 20400, 'each lesson keeps the rate it was given');

// 3. Balances, partial payments, unconfirmed receipts.
assert.deepEqual(instructorBalance('i-1'), { dueCents: 48000, paidCents: 35000, balanceCents: 13000, status: 'partial', unconfirmedCents: 15000 });
assert.deepEqual(instructorBalance('i-2'), { dueCents: 40150, paidCents: 10000, balanceCents: 30150, status: 'partial', unconfirmedCents: 10000 });
assert.deepEqual(instructorBalance('i-3'), { dueCents: 34700, paidCents: 0, balanceCents: 34700, status: 'pending', unconfirmedCents: 0 });
for (const id of ['i-1', 'i-2', 'i-3']) assert.ok(instructorBalance(id).paidCents <= instructorBalance(id).dueCents, 'demo never overpays');
assert.deepEqual(instructorsWithLessons(parseScope({ unidade: 'u-jeri-lagoa' })), ['i-2']);
assert.ok(EXTERNAL_PAYMENTS.every((p) => Number.isInteger(p.cents) && p.cents > 0 && p.reference.length >= 3));

// 4. Receivables and payables.
assert.deepEqual(RECEIVABLES.map(receivableStatus), ['open', 'overdue', 'paid']);
assert.deepEqual(PAYABLES.map(payableStatus), ['open', 'paid', 'partial']);
assert.equal(dueStatus({ dueOffset: -1, cents: 100 }, 100), 'paid', 'paid even if past due');
assert.equal(dueStatus({ dueOffset: -1, cents: 100 }, 50), 'overdue');
assert.equal(dueStatus({ dueOffset: 3, cents: 100 }, 50), 'partial');
assert.equal(dueStatus({ dueOffset: 3, cents: 100 }, 0), 'open');

// 5. External payments are records, never more than is owed.
const ok = { instructorId: 'i-1', amount: '130,00', method: 'pix', reference: 'PIX-1' };
assert.deepEqual(validateExternalPayment(ok), {}, 'paying exactly the balance settles it');
assert.ok(validateExternalPayment({ ...ok, amount: '130,01' }).amount, 'cannot exceed the balance');
assert.deepEqual(validateExternalPayment({ ...ok, amount: '10,00' }), {}, 'partial payments are accepted');
for (const amount of ['0', '', 'abc', '1,234']) assert.ok(validateExternalPayment({ ...ok, amount }).amount, `amount ${amount}`);
assert.ok(validateExternalPayment({ ...ok, reference: 'a' }).reference);
assert.ok(validateExternalPayment({ ...ok, method: 'boleto' }).method);
assert.ok(validateExternalPayment({ ...ok, instructorId: 'i-9' }).instructorId);

// 6. Period closing: revenue - expenses - commissions earned in the period.
const s30 = periodSummary(all, 30);
assert.deepEqual([s30.revenueCents, s30.expenseCents, s30.commissionDueCents, s30.resultCents], [282000, 98000, 122850, 61150]);
const s7 = periodSummary(all, 7);
assert.equal(s7.commissionDueCents, 108550, 'a lesson from 9 days ago is outside 7 days'); assert.equal(s7.resultCents, 75450);
assert.equal(s30.commissionPaidCents, 45000, 'what was paid is shown but never changes the result');
const prea = periodSummary(parseScope({ unidade: 'u-prea' }), 30);
assert.deepEqual([prea.revenueCents, prea.expenseCents, prea.commissionDueCents, prea.resultCents], [172000, 30000, 65900, 76100]);

// 7. Reports partition the company: units and employees add up to the consolidated figures.
assert.equal(byUnit(all, 30).reduce((t, u) => t + u.resultCents, 0), s30.resultCents, 'unit results add up to the consolidated result');
assert.deepEqual(byUnit(parseScope({ unidade: 'u-prea' }), 30).map((u) => u.id), ['u-prea'], 'a report only shows the units of the filter');
assert.equal(byEmployee(all, 30).reduce((t, e) => t + e.revenueCents, 0), s30.revenueCents);
assert.ok(FIN_ENTRIES.every((e) => EMPLOYEES.some((x) => x.id === e.employeeId) && UNITS.some((u) => u.id === e.unitId) && Number.isInteger(e.cents)));
assert.ok(byEmployee(parseScope({ unidade: 'u-jeri-lagoa' }), 30).every((e) => e.entries > 0 || e.registers > 0));

// 8. Export content agrees with the screens.
const rows = financeSheetRows(all, 30);
assert.equal(rows.find((r) => r[0] === 'Resultado')[1].cents, 61150);
assert.ok(rows.some((r) => r[0] === 'Pix' || String(r[0]).includes('fora do VentoKite')), 'the report states payments happen outside');
assert.ok(financePdfLines(all, 30).some((l) => l.startsWith('Resultado') && l.includes('611,50')));

// 9. Screens, menu, tabs, route, and no money movement anywhere.
const base = 'src/app/admin/business/financeiro';
for (const p of ['', 'receitas', 'despesas', 'receber', 'pagar', 'comissoes', 'pagamentos', 'fechamento', 'relatorios/consolidado', 'relatorios/unidades', 'relatorios/funcionarios', 'comprovantes', 'comprovantes/[id]']) assert.ok(existsSync(`${base}/${p}/page.tsx`.replace('//', '/')), p);
for (const href of ['/admin/business/financeiro', '/admin/business/financeiro/comissoes', '/admin/business/financeiro/pagamentos', '/admin/business/financeiro/relatorios/consolidado']) assert.ok(BUSINESS_NAV.some((i) => i.href === href), href);
for (const m of read('src/components/business/finance-kit.tsx').matchAll(/href: '(\/admin\/business\/[^']+)'/g)) assert.ok(existsSync(`src/app${m[1]}/page.tsx`), `tab ${m[1]}`);
const route = read(`${base}/relatorios/arquivo/route.ts`);
assert.match(route, /viewer\.role !== 'admin' \|\| !viewer\.secondFactor\) return new Response\('Acesso negado\.', \{ status: 403 \}\)/);
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of [...walk(base), 'src/lib/business/finance.ts', 'src/components/business/payment-form.tsx'].filter((x) => /\.tsx?$/.test(x))) {
  const code = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\btransfer\(|createPayment|stripe|mercadopago|fetch\(|splitPayment/i, `${f}: the platform never moves the school's money`);
}
assert.match(read(`${base}/pagamentos/page.tsx`), /O VentoKite só registra/); assert.match(read(`${base}/comissoes/page.tsx`), /nunca transfere dinheiro/);
console.log('PASS: Business finance: integer commissions with frozen rates, balances and partial external payments, period closing, reports that add up, admin-only export, no money movement');
