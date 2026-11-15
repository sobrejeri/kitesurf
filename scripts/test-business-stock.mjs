import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { EQUIPMENT, MAINTENANCE, PRODUCTS, RENTALS, STOCK_MOVEMENTS, UNITS } from '../src/lib/business/demo.ts';
import { activeRental, equipmentHistory, equipmentStatus, isLow, lowStockRows, productStock, rentalPrice, rentalState, returnOutcome, totalStock, transferMovements, validateEquipment, validateMaintenance, validateProduct, validateRental, validateReturn, validateStockMovement, validateTransfer, equipmentInScope } from '../src/lib/business/stock.ts';
import { stockPdfLines, stockSheetRows } from '../src/lib/business/report.ts';
import { parseScope } from '../src/lib/business/rules.ts';
import { BUSINESS_NAV } from '../src/components/business/nav.ts';

// Business block 9: stock (a ledger) and individually tracked rentable equipment.
const read = (p) => readFileSync(p, 'utf8');
const all = parseScope({});

// 1. Stock is the sum of its movements, never typed in.
assert.equal(productStock('p-cam', 'u-prea'), 17); assert.equal(productStock('p-cam', 'u-jeri-centro'), 8); assert.equal(productStock('p-cam', 'u-jeri-lagoa'), 8);
assert.equal(productStock('p-pro', 'u-prea'), 25); assert.equal(productStock('p-bol', 'u-prea'), 4);
assert.equal(productStock('p-bon', 'u-jeri-lagoa'), 0, 'no movements, no stock');
assert.equal(totalStock('p-cam', all), 33);
assert.equal(totalStock('p-cam', parseScope({ unidade: 'u-prea' })), 17, 'the unit filter narrows the total');
assert.ok(STOCK_MOVEMENTS.every((m) => Number.isInteger(m.qty) && m.qty !== 0), 'whole, non-zero quantities');
for (const m of STOCK_MOVEMENTS) assert.ok((m.type === 'in' || m.type === 'transfer_in') ? m.qty > 0 : m.type === 'adjust' || m.qty < 0, `${m.id} sign matches its type`);
for (const p of PRODUCTS) for (const u of UNITS) assert.ok(productStock(p.id, u.id) >= 0, `${p.id}@${u.id} never negative`);

// 2. A transfer is two movements: the total across units does not change.
const before = PRODUCTS.map((p) => totalStock(p.id, all));
const ledger = [...STOCK_MOVEMENTS, ...transferMovements({ productId: 'p-pro', fromUnit: 'u-prea', toUnit: 'u-jeri-lagoa', qty: 7, id: 'tr-x', dayOffset: 0 })];
assert.equal(productStock('p-pro', 'u-prea', ledger), 18); assert.equal(productStock('p-pro', 'u-jeri-lagoa', ledger), 11);
assert.deepEqual(PRODUCTS.map((p) => totalStock(p.id, all, ledger)), before, 'conserved');
const moves = transferMovements({ productId: 'p-pro', fromUnit: 'u-prea', toUnit: 'u-jeri-lagoa', qty: 7, id: 'tr-x', dayOffset: 0 });
assert.equal(moves.reduce((t, m) => t + m.qty, 0), 0); assert.ok(moves.every((m) => m.transferId === 'tr-x'));
const existing = STOCK_MOVEMENTS.filter((m) => m.transferId);
assert.equal(existing.reduce((t, m) => t + m.qty, 0), 0, 'the demo transfer balances');

// 3. Low stock.
assert.deepEqual(lowStockRows(all).map((r) => `${r.product.id}@${r.unitId}`).sort(), ['p-bol@u-jeri-centro', 'p-bol@u-jeri-lagoa', 'p-bon@u-jeri-lagoa', 'p-oc@u-jeri-lagoa', 'p-pro@u-jeri-lagoa'], 'at or below the minimum, including a unit with none');
assert.deepEqual(lowStockRows(parseScope({ unidade: 'u-prea' })), [], 'Preá is above every minimum');
assert.ok(isLow(PRODUCTS.find((p) => p.id === 'p-pro'), 'u-jeri-lagoa') && !isLow(PRODUCTS.find((p) => p.id === 'p-pro'), 'u-prea'));

// 4. Validations.
const t = { productId: 'p-cam', fromUnit: 'u-prea', toUnit: 'u-jeri-lagoa', qty: '17' };
assert.deepEqual(validateTransfer(t), {}, 'moving everything is allowed');
assert.ok(validateTransfer({ ...t, qty: '18' }).qty, 'cannot move more than the origin has');
assert.ok(validateTransfer({ ...t, toUnit: 'u-prea' }).toUnit, 'origin and destination differ');
assert.ok(validateTransfer({ ...t, toUnit: 'u-camocim' }).toUnit, 'inactive unit');
for (const qty of ['0', '-2', '1.5', 'x', '']) assert.ok(validateTransfer({ ...t, qty }).qty, `qty ${qty}`);
const mv = { productId: 'p-cam', unitId: 'u-prea', type: 'sale', qty: '17', note: 'Venda' };
assert.deepEqual(validateStockMovement(mv), {}); assert.ok(validateStockMovement({ ...mv, qty: '18' }).qty, 'a sale cannot take stock below zero');
assert.deepEqual(validateStockMovement({ ...mv, type: 'adjust', qty: '-17' }), {}); assert.ok(validateStockMovement({ ...mv, type: 'adjust', qty: '-18' }).qty);
assert.ok(validateStockMovement({ ...mv, type: 'adjust', qty: '0' }).qty); assert.deepEqual(validateStockMovement({ ...mv, type: 'in', qty: '500' }), {});
assert.ok(validateStockMovement({ ...mv, note: '' }).note);
assert.deepEqual(validateProduct({ name: 'Chaveiro', sku: 'CHA-01', price: '15,00', min: '2' }), {});
assert.ok(validateProduct({ name: 'Chaveiro', sku: 'cam-vk', price: '15,00', min: '2' }).sku, 'SKU is unique, case-insensitive');
assert.ok(validateProduct({ name: 'Chaveiro', sku: 'CHA-01', price: '0,50', min: '2' }).price); assert.ok(validateProduct({ name: 'Chaveiro', sku: 'CHA-01', price: '15', min: '-1' }).min);

// 5. Equipment status is derived and consistent: rented <=> an active rental; maintenance <=> an open ticket.
const status = Object.fromEntries(EQUIPMENT.map((e) => [e.code, equipmentStatus(e)]));
assert.deepEqual([status['PR-01'], status['PI-03'], status['PR-04'], status['CA-09'], status['PI-01'], status['TR-01']], ['rented', 'rented', 'maintenance', 'retired', 'available', 'available']);
for (const e of EQUIPMENT) {
  assert.equal(equipmentStatus(e) === 'rented', Boolean(activeRental(e.id)) && !e.retired && !MAINTENANCE.some((m) => m.equipmentId === e.id && m.status === 'open'));
  assert.ok(RENTALS.filter((r) => r.equipmentId === e.id && !r.returned).length <= 1, `${e.code} has at most one active rental`);
  assert.equal(MAINTENANCE.filter((m) => m.equipmentId === e.id && m.status === 'open').length <= 1, true);
}
assert.ok(new Set(EQUIPMENT.map((e) => e.code)).size === EQUIPMENT.length, 'unique individual codes');
for (const r of RENTALS) assert.equal(r.priceCents, rentalPrice(EQUIPMENT.find((e) => e.id === r.equipmentId).type, r.hours), `${r.id} price = hours x hourly rate`);
assert.equal(rentalPrice('prancha', 2), 8000);

// 6. Rentals, returns, maintenance rules.
assert.deepEqual(validateRental({ equipmentId: 'eq-3', customer: 'Cliente Novo', hours: '2' }), {});
assert.ok(validateRental({ equipmentId: 'eq-1', customer: 'Cliente Novo', hours: '2' }).equipmentId, 'already rented');
assert.ok(validateRental({ equipmentId: 'eq-10', customer: 'Cliente Novo', hours: '2' }).equipmentId, 'in maintenance cannot be rented');
assert.ok(validateRental({ equipmentId: 'eq-11', customer: 'Cliente Novo', hours: '2' }).equipmentId, 'retired cannot be rented');
for (const hours of ['0', '9', 'x', '']) assert.ok(validateRental({ equipmentId: 'eq-3', customer: 'Cliente Novo', hours }).hours, `hours ${hours}`);
assert.ok(validateRental({ equipmentId: 'eq-3', customer: 'Jo', hours: '2' }).customer);
assert.deepEqual(validateReturn({ rentalId: 'rt-1', condition: 'bom', note: '' }), {}, 'same condition needs no note');
assert.ok(validateReturn({ rentalId: 'rt-1', condition: 'regular', note: '' }).note, 'worse needs a note');
assert.deepEqual(validateReturn({ rentalId: 'rt-1', condition: 'regular', note: 'Arranhões na base' }), {});
assert.ok(validateReturn({ rentalId: 'rt-3', condition: 'bom', note: '' }).rentalId, 'already returned');
assert.equal(returnOutcome('ruim'), 'maintenance'); assert.equal(returnOutcome('regular'), 'available');
assert.deepEqual(validateMaintenance({ equipmentId: 'eq-3', description: 'Costura soltando' }), {});
assert.ok(validateMaintenance({ equipmentId: 'eq-1', description: 'Costura soltando' }).equipmentId, 'cannot open maintenance on a rented item');
assert.ok(validateMaintenance({ equipmentId: 'eq-10', description: 'Costura soltando' }).equipmentId, 'only one open ticket');
assert.ok(validateMaintenance({ equipmentId: 'eq-11', description: 'Costura soltando' }).equipmentId, 'retired');
assert.deepEqual(validateEquipment({ code: 'PR-05', type: 'prancha', unitId: 'u-prea', condition: 'novo' }), {});
assert.ok(validateEquipment({ code: 'PR-01', type: 'prancha', unitId: 'u-prea', condition: 'novo' }).code, 'code is unique'); assert.ok(validateEquipment({ code: 'P1', type: 'prancha', unitId: 'u-prea', condition: 'novo' }).code);
assert.ok(validateEquipment({ code: 'PR-05', type: 'x', unitId: 'u-camocim', condition: 'x' }).unitId);

// 7. Overdue: time-based, with a fixed clock.
const r1 = RENTALS.find((r) => r.id === 'rt-1'); const r2 = RENTALS.find((r) => r.id === 'rt-2');
assert.equal(rentalState(r1, 10 * 60 + 30), 'active'); assert.equal(rentalState(r1, 11 * 60), 'active', 'exactly at the end is still on time'); assert.equal(rentalState(r1, 11 * 60 + 1), 'overdue');
assert.equal(rentalState(r2, 15 * 60), 'active'); assert.equal(rentalState(r2, 17 * 60 + 1), 'overdue');
assert.equal(rentalState({ ...r1, dayOffset: -1 }, 0), 'overdue', 'out since yesterday'); assert.equal(rentalState(RENTALS[2], 0), 'returned');

// 8. History and reports.
assert.deepEqual(equipmentHistory('eq-10').map((h) => h.text.split(':')[0].split(' ')[0]), ['Manutenção', 'Devolvido', 'Alugado'], 'newest first');
assert.ok(equipmentHistory('eq-10')[1].text.includes('ruim') && equipmentHistory('eq-10')[1].text.includes('Quilha quebrada'));
const sheet = stockSheetRows(all); assert.ok(sheet.some((r) => r[0] === 'Camiseta VentoKite' && r[2] === '17'));
assert.ok(stockSheetRows(parseScope({ unidade: 'u-prea' })).every((r) => r[0] !== 'PI-03'), 'filtered reports leave other units out');
assert.ok(stockPdfLines(all).some((l) => l.includes('PR-04') && l.includes('Em manutenção')));
assert.equal(equipmentInScope(parseScope({ unidade: 'u-prea' })).filter((e) => e.unitId !== 'u-prea').length, 0);

// 9. Screens, tabs, route, no payments.
const base = 'src/app/admin/business/estoque';
for (const p of ['', 'produtos', 'produtos/novo', 'equipamentos', 'equipamentos/novo', 'equipamentos/[id]', 'unidades', 'movimentacoes', 'movimentacoes/nova', 'transferencias', 'alugueis', 'devolucoes', 'manutencao', 'relatorios']) assert.ok(existsSync(`${base}/${p}/page.tsx`.replace('//', '/')), p);
for (const href of ['/admin/business/estoque', '/admin/business/estoque/equipamentos', '/admin/business/estoque/alugueis', '/admin/business/estoque/relatorios']) assert.ok(BUSINESS_NAV.some((i) => i.href === href), href);
for (const m of read('src/components/business/stock-kit.tsx').matchAll(/href: `\$\{BASE\}([^`]*)`/g)) assert.ok(existsSync(`${base}${m[1]}/page.tsx`), `tab ${m[1] || '/'}`);
assert.match(read(`${base}/relatorios/arquivo/route.ts`), /viewer\.role !== 'admin' \|\| !viewer\.secondFactor\) return new Response\('Acesso negado\.', \{ status: 403 \}\)/);
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of [...walk(base), 'src/lib/business/stock.ts', 'src/components/business/stock-forms.tsx'].filter((x) => /\.tsx?$/.test(x))) {
  assert.doesNotMatch(read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /createPayment|stripe|mercadopago|fetch\(|charge\w*\(/i, `${f}: no payment processing`);
}
console.log('PASS: Business stock: ledger-derived quantities, conserved transfers, non-negative stock, derived equipment status, rental/return/maintenance rules, overdue by clock, valid exports');
