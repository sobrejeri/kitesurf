import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { COUPONS, EQUIPMENT, ORIGIN_LABEL, SHOP_ORDERS, UNITS } from '../src/lib/business/demo.ts';
import { availableSlots } from '../src/lib/business/bookings.ts';
import { applyCoupon, couponLabel, itemUnitPriceCents, lineCents, orderTotals, ordersInScope, originTotals, rentalAvailable, splitByUnit, subtotalCents, validateCoupon, validateCustomer, validateItem, validateStore } from '../src/lib/business/shop.ts';
import { equipmentStatus } from '../src/lib/business/stock.ts';
import { parseScope } from '../src/lib/business/rules.ts';
import { BUSINESS_NAV } from '../src/components/business/nav.ts';

// Business block 5: the school's shop. Orders are requests, never payments.
const read = (p) => readFileSync(p, 'utf8');
const ctx = { weekday0: 1, nowMinutes: 0 }; // fixed "today" so slot checks are deterministic
const slot = availableSlots({ unitId: 'u-prea', serviceId: 's-ini', instructorId: 'i-1', dayOffset: 2 }, ctx)[0];
assert.ok(slot, 'there is a free slot to test with');
const lesson = { id: 'l1', kind: 'lesson', serviceId: 's-ini', unitId: 'u-prea', instructorId: 'i-1', dayOffset: 2, start: slot, people: 1 };
const shirtPrea = { id: 'p1', kind: 'product', productId: 'p-cam', unitId: 'u-prea', qty: 2 };

// 1. Prices come from the catalog (the unit's own price wins), in integer cents.
assert.equal(itemUnitPriceCents(lesson), 26000, 'Preá has no own price: base');
assert.equal(itemUnitPriceCents({ ...lesson, unitId: 'u-jeri-centro', instructorId: 'i-2' }), 28000, 'Jeri Centro has its own price');
assert.equal(itemUnitPriceCents(shirtPrea), 6000); assert.equal(lineCents(shirtPrea), 12000);
assert.equal(lineCents({ id: 'r', kind: 'rental', type: 'colete', unitId: 'u-prea', hours: 2, qty: 2 }), 6000, '1500/h × 2 h × 2');
assert.equal(subtotalCents([lesson, shirtPrea]), 38000);
for (const o of SHOP_ORDERS) for (const i of o.items) assert.ok(Number.isInteger(lineCents(i)) && lineCents(i) > 0, `${o.number}: whole cents`);

// 2. Stock and rentals: counted per unit, including what the cart already holds.
assert.equal(validateItem(lesson, [], ctx), null);
assert.equal(validateItem({ ...lesson, start: '03:00' }, [], ctx), 'Escolha um horário livre.');
assert.match(validateItem({ ...lesson, people: 3 }, [], ctx), /capacidade/);
assert.match(validateItem(lesson, [{ ...lesson, id: 'l2' }], ctx), /já está no carrinho/, 'same instructor, day and time twice');
assert.equal(validateItem(shirtPrea, [], ctx), null);
assert.match(validateItem({ ...shirtPrea, qty: 18 }, [], ctx), /Só há 17 em estoque/);
assert.match(validateItem({ ...shirtPrea, qty: 10 }, [{ ...shirtPrea, id: 'p2', qty: 8 }], ctx), /Só há 17/, 'the cart counts together');
assert.match(validateItem({ ...shirtPrea, unitId: 'u-jeri-lagoa', productId: 'p-bon' }, [], ctx), /Só há 0/, 'no stock in that unit');
assert.match(validateItem({ ...shirtPrea, qty: 0 }, [], ctx), /Quantidade/);
assert.match(validateItem({ ...shirtPrea, unitId: 'u-camocim' }, [], ctx), /unidade ativa/, 'inactive unit');
for (const t of ['prancha', 'pipa', 'trapezio', 'colete', 'capacete']) for (const u of UNITS) {
  assert.equal(rentalAvailable(t, u.id), EQUIPMENT.filter((e) => e.type === t && e.unitId === u.id && equipmentStatus(e) === 'available').length, `${t}@${u.id}`);
}
const free = rentalAvailable('prancha', 'u-prea');
assert.equal(free, 1, 'PR-01 is rented, PR-02 is free');
assert.equal(validateItem({ id: 'r', kind: 'rental', type: 'prancha', unitId: 'u-prea', hours: 2, qty: free }, [], ctx), null);
assert.match(validateItem({ id: 'r', kind: 'rental', type: 'prancha', unitId: 'u-prea', hours: 2, qty: free + 1 }, [], ctx), /disponível/);
assert.match(validateItem({ id: 'r', kind: 'rental', type: 'prancha', unitId: 'u-prea', hours: 9, qty: 1 }, [], ctx), /1 a 8 horas/);
// Rented, maintained and retired equipment is never offered.
for (const e of EQUIPMENT.filter((x) => equipmentStatus(x) !== 'available')) assert.ok(rentalAvailable(e.type, e.unitId) <= EQUIPMENT.filter((x) => x.type === e.type && x.unitId === e.unitId).length - 1);

// 3. Coupons: every rule, and the discount never exceeds what it covers.
const cart = [lesson, shirtPrea]; // 38.000
const ten = applyCoupon('vento10', cart); // lower case is accepted
assert.ok(ten.ok); assert.equal(ten.discountCents, 3800, '10% of 38.000, rounded down once');
assert.equal(applyCoupon('NAOEXISTE', cart).error, 'Cupom não encontrado.');
assert.equal(applyCoupon('PAUSADO', cart).error, 'Este cupom está pausado.');
assert.equal(applyCoupon('VERAO', cart).error, 'Este cupom venceu.');
assert.equal(applyCoupon('PREA20', cart).error, 'Este cupom atingiu o limite de usos.');
const fixed = [{ id: 'c', kind: 'fixed', value: 99000, code: 'BIG', minCents: 0, unitIds: [], untilOffset: 5, maxUses: 5, used: 0, active: true }];
assert.equal(applyCoupon('BIG', [shirtPrea], fixed).discountCents, 12000, 'a fixed coupon never goes above the items');
const prea = [{ id: 'c', kind: 'percent', value: 1000, code: 'PREA', minCents: 0, unitIds: ['u-prea'], untilOffset: 5, maxUses: 5, used: 0, active: true }];
const mixed = [shirtPrea, { id: 'j', kind: 'product', productId: 'p-cam', unitId: 'u-jeri-centro', qty: 1 }];
assert.equal(applyCoupon('PREA', mixed, prea).discountCents, 1200, 'only the covered unit counts: 10% of 12.000');
assert.equal(applyCoupon('PREA', [{ ...shirtPrea, unitId: 'u-jeri-centro' }], prea).error, 'Este cupom não vale para as unidades do carrinho.');
const min = [{ id: 'c', kind: 'fixed', value: 1000, code: 'MIN', minCents: 50000, unitIds: [], untilOffset: 5, maxUses: 5, used: 0, active: true }];
assert.equal(applyCoupon('MIN', cart, min).error, 'O carrinho não atingiu o valor mínimo do cupom.');

// 4. Several units become separate operational orders, and the parts always add up.
const two = [lesson, shirtPrea, { id: 'j', kind: 'product', productId: 'p-cam', unitId: 'u-jeri-centro', qty: 3 }, { id: 'k', kind: 'product', productId: 'p-pro', unitId: 'u-jeri-lagoa', qty: 1 }];
for (const discount of [0, 1, 999, 3333, 7777, 20000, subtotalCents(two)]) {
  const parts = splitByUnit(two, undefined, discount);
  assert.equal(parts.length, 3, 'one operational order per unit');
  assert.equal(parts.reduce((n, p) => n + p.discountCents, 0), discount, `discount ${discount} shared exactly`);
  assert.equal(parts.reduce((n, p) => n + p.totalCents, 0), subtotalCents(two) - discount);
  assert.ok(parts.every((p) => p.discountCents >= 0 && p.totalCents >= 0));
}
const covered = splitByUnit(mixed, prea[0], 1200);
assert.equal(covered.find((p) => p.unitId === 'u-jeri-centro').discountCents, 0, 'an uncovered unit gets no discount');
assert.equal(covered.find((p) => p.unitId === 'u-prea').discountCents, 1200);

// 5. Orders: totals, scope and origin.
const o1 = SHOP_ORDERS.find((o) => o.id === 'o-1');
assert.deepEqual([orderTotals(o1).subtotalCents, orderTotals(o1).discountCents, orderTotals(o1).totalCents], [32000, 3200, 28800]);
const o2 = SHOP_ORDERS.find((o) => o.id === 'o-2');
assert.equal(orderTotals(o2).totalCents, 59000); assert.equal(orderTotals(o2).units.length, 1);
const o3 = SHOP_ORDERS.find((o) => o.id === 'o-3');
assert.equal(orderTotals(o3).units.length, 2, 'two units, two operational orders');
for (const o of SHOP_ORDERS) { const t = orderTotals(o); assert.equal(t.units.reduce((n, u) => n + u.totalCents, 0), t.totalCents, `${o.number} parts = total`); assert.ok(t.totalCents <= t.subtotalCents); }
assert.equal(ordersInScope(new Set(UNITS.map((u) => u.id))).length, SHOP_ORDERS.length);
assert.deepEqual(ordersInScope(new Set(['u-jeri-lagoa'])).map((o) => o.id), [], 'scope narrows orders');
assert.equal(ordersInScope(new Set(['u-jeri-centro'])).length, 2);
const origins = originTotals(SHOP_ORDERS);
assert.ok(!origins.some((o) => o.origin === ORIGIN_LABEL.balcao), 'cancelled orders do not count');
assert.equal(origins.reduce((n, o) => n + o.cents, 0), SHOP_ORDERS.filter((o) => o.status !== 'cancelled').reduce((n, o) => n + orderTotals(o).totalCents, 0));
assert.ok(parseScope({ unidade: 'u-prea' }).unidade);

// 6. Forms.
assert.deepEqual(validateCustomer({ name: 'Ana Souza', phone: '(88) 99999-0000' }), {});
assert.ok(validateCustomer({ name: 'A', phone: '123' }).name && validateCustomer({ name: 'A', phone: '123' }).phone);
assert.deepEqual(validateStore({ name: 'Escola', slogan: 'x', whatsapp: '88999990000', accent: 'azul' }), {});
assert.ok(validateStore({ name: 'Escola', slogan: 'x', whatsapp: '88999990000', accent: 'rosa' }).accent);
const good = { code: 'NOVO10', kind: 'percent', value: '10', min: '', days: '30', maxUses: '50' };
assert.deepEqual(validateCoupon(good), {});
assert.ok(validateCoupon({ ...good, code: 'vento10' }).code, 'duplicate code, any case');
assert.ok(validateCoupon({ ...good, code: 'a b' }).code); assert.ok(validateCoupon({ ...good, value: '80' }).value, 'percent up to 50');
assert.ok(validateCoupon({ ...good, kind: 'fixed', value: '0,50' }).value); assert.deepEqual(validateCoupon({ ...good, kind: 'fixed', value: '25,00', min: '100,00' }), {});
assert.ok(validateCoupon({ ...good, days: '0' }).days && validateCoupon({ ...good, maxUses: 'x' }).maxUses && validateCoupon({ ...good, min: '1,234' }).min);
assert.equal(couponLabel(COUPONS[0]), '10%'); assert.equal(couponLabel(COUPONS[1]), 'R$ 20,00');

// 7. Honesty and safety guards.
const root = 'src/app/admin/business/lojinha';
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const files = [...walk(root), 'src/lib/business/shop.ts', 'src/components/business/cart.tsx', 'src/components/business/shop-kit.tsx'];
for (const f of files) {
  const s = read(f);
  assert.ok(!/service_role|SUPABASE_SERVICE|process\.env|supabase|createClient|fetch\(/.test(s), `${f}: no database, secrets or network`);
  assert.ok(!/toFixed|parseFloat|Number\(.*\.\d/.test(s), `${f}: no floating-point money`);
  assert.ok(!/checkout|stripe|mercadopago|pagseguro|createPayment|payment_intent|markPaid|statusPago|marcar como pago/i.test(s), `${f}: no payment machinery`);
}
for (const f of walk(root).filter((p) => p.endsWith('page.tsx') && !p.includes('/vitrine/'))) assert.match(read(f), /DemoBanner/, `${f}: demo banner`);
assert.match(read(`${root}/vitrine/layout.tsx`), /DemoBanner/, 'the whole storefront preview carries the banner');
assert.match(read('src/components/business/cart.tsx'), /não confirma pagamento/, 'the order says it does not confirm payment');
assert.match(read(`${root}/pedidos/[id]/page.tsx`), /Pagamento não confirmado/);
for (const route of ['pedidos', 'cupons', 'personalizar', 'vitrine/catalogo', 'vitrine/carrinho', 'vitrine/resumo', 'vitrine/alugueis', 'vitrine/aulas/[id]', 'vitrine/produtos/[id]', 'pedidos/[id]']) assert.ok(existsSync(`${root}/${route}/page.tsx`), route);
// The cart holds choices only: no price or total is ever stored.
const cartSrc = read('src/components/business/cart.tsx');
assert.ok(!/priceCents|totalCents/.test(cartSrc.slice(cartSrc.indexOf('export function CartProvider'), cartSrc.indexOf('export function CartLink'))), 'the stored cart has no prices');
assert.match(read(`${root}/vitrine/catalogo/page.tsx`), /UNITS\.some\(\(u\) => u\.active && u\.city === c\)/, 'the city filter hides cities without an active unit');
// Admin-only: the Business layout guards everything under it.
assert.match(read('src/app/admin/business/layout.tsx'), /requireRole\(\['admin'\]/);
for (const href of ['/admin/business/lojinha', '/admin/business/lojinha/pedidos', '/admin/business/lojinha/vitrine', '/admin/business/lojinha/cupons']) assert.ok(BUSINESS_NAV.some((n) => n.href === href), `nav: ${href}`);

console.log('PASS: business shop (catalog, cart, coupons, per-unit orders, no payment simulated)');
