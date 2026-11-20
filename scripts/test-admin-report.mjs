import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildReport, parsePeriod } from '../src/lib/admin-report.ts';

const now = Date.parse('2026-11-20T12:00:00Z');
const day = (n) => new Date(now - n * 86_400_000).toISOString();
const b = (o) => ({ status: 'confirmed', is_test: false, created_at: day(1), total_cents: 30000, platform_cents: 6000, partner_cents: 1500, instructor_net_cents: 22500, beach: { name: 'Preá' }, instructor: { full_name: 'Ana' }, ...o });
const rows = [
  b({}), b({ status: 'completed', total_cents: 33333, platform_cents: 6667, partner_cents: 0, instructor_net_cents: 26666, beach: { name: 'Jeri' }, instructor: { full_name: 'Beto' } }),
  b({ status: 'cancelled' }), b({ status: 'awaiting_payment' }),
  b({ is_test: true }),                 // teste fica fora
  b({ created_at: day(40) }),           // fora do período de 30 dias
];
const r = buildReport(rows, 30, now);
assert.equal(r.total, 4, 'testes e fora do período não contam');
assert.deepEqual(r.byStatus, { awaiting_payment: 1, confirmed: 1, completed: 1, cancelled: 1 });
assert.equal(r.paidCount, 2);
assert.equal(r.volumeCents, 63333, 'volume = soma de confirmadas e concluídas, em centavos inteiros');
assert.equal(r.platformCents + r.partnerCents + r.instructorCents, r.volumeCents, 'as partes somam o total');
assert.ok(Number.isInteger(r.averageTicketCents) && r.averageTicketCents === 31667, 'ticket médio inteiro');
assert.equal(r.cancellationBps, 2500, '1 de 4 = 25,00%');
assert.deepEqual(r.byBeach.map((x) => x.name), ['Jeri', 'Preá'], 'ordena por volume');
assert.equal(buildReport([], 7, now).averageTicketCents, 0, 'sem dados não divide por zero');
assert.equal(buildReport(rows, 90, now).total, 5, '90 dias inclui a de 40 dias');
assert.equal(parsePeriod('7'), 7); assert.equal(parsePeriod('x'), 30); assert.equal(parsePeriod(undefined), 30); assert.equal(parsePeriod('999'), 30);

const page = readFileSync('src/app/admin/(app)/relatorios/page.tsx', 'utf8');
assert.match(page, /requireRole\(\['admin'\]/, 'só admin');
assert.doesNotMatch(page, /service_role|SUPABASE_SECRET/);
assert.match(readFileSync('src/components/workspace-nav.ts', 'utf8'), /\/admin\/relatorios/, 'item no menu do Admin');
console.log('PASS: relatório do Admin soma em centavos, exclui testes e período, e só abre para Admin');
