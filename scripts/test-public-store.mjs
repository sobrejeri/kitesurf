import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CancelInput, FreeSlotsInput, MAX_CART_ITEMS, MAX_QTY, PlaceOrderInput, RENTAL_MAX_HOURS,
  brl, friendlyOrderError, minutesLabel, rentalName, sanitizeCart, setLineQty, statusLabel,
} from '../src/lib/public-store.ts';

// Student-facing storefront (Business phase 7 screens): what the browser may send, how the cart
// survives storage tampering, that every database error reads clearly, and who may see what.
const read = (p) => readFileSync(p, 'utf8');
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';
const S1 = '44444444-4444-4444-8444-444444444444';
const I1 = '55555555-5555-4555-8555-555555555555';
const order = (items, extra = {}) => ({ slug: 'ventos-do-norte', customer: 'Aluna Um', phone: '(88) 99999-0101', items, ...extra });
const product = { kind: 'product', unit_id: U1, product_id: P1, qty: 2 };
const lesson = { kind: 'lesson', unit_id: U1, service_id: S1, instructor_id: I1, starts_at: '2027-02-01T08:00:00-03:00' };
const rental = { kind: 'rental', unit_id: U1, type: 'prancha', hours: 2, qty: 1 };

// 1. The browser sends choices only. Any money field (or any other extra field) is refused.
assert.ok(PlaceOrderInput.safeParse(order([product, lesson, rental])).success, 'a valid order of the three kinds is accepted');
for (const money of ['price_cents', 'unit_price', 'line', 'total_cents', 'discount_cents', 'commission_cents', 'affiliate_bps']) {
  assert.ok(!PlaceOrderInput.safeParse(order([{ ...product, [money]: 1 }])).success, `item with ${money} is refused`);
  assert.ok(!PlaceOrderInput.safeParse(order([product], { [money]: 1 })).success, `order with ${money} is refused`);
}
assert.ok(!PlaceOrderInput.safeParse(order([{ ...lesson, qty: 1 }])).success, 'a lesson carries no quantity');
assert.ok(!PlaceOrderInput.safeParse(order([product], { company_id: U2 })).success, 'the company comes from the slug, never from the browser');

// Same limits as the database (company_place_order): 1 to 10 items, quantity 1 to 20, rental 1 to 8 hours.
assert.equal(MAX_CART_ITEMS, 10); assert.equal(MAX_QTY, 20); assert.equal(RENTAL_MAX_HOURS, 8);
assert.ok(!PlaceOrderInput.safeParse(order([])).success, 'empty order');
assert.ok(PlaceOrderInput.safeParse(order(Array.from({ length: 10 }, () => product))).success, 'ten items');
assert.ok(!PlaceOrderInput.safeParse(order(Array.from({ length: 11 }, () => product))).success, 'eleven items');
assert.ok(PlaceOrderInput.safeParse(order([{ ...product, qty: 20 }])).success && !PlaceOrderInput.safeParse(order([{ ...product, qty: 21 }])).success, 'product quantity 20, not 21');
assert.ok(!PlaceOrderInput.safeParse(order([{ ...product, qty: 0 }])).success && !PlaceOrderInput.safeParse(order([{ ...product, qty: 1.5 }])).success, 'quantity is a positive whole number');
assert.ok(PlaceOrderInput.safeParse(order([{ ...rental, hours: 8 }])).success && !PlaceOrderInput.safeParse(order([{ ...rental, hours: 9 }])).success, 'rental 8 hours, not 9 (the database refuses 9)');
assert.ok(!PlaceOrderInput.safeParse(order([{ ...product, unit_id: 'not-a-uuid' }])).success, 'ids are UUIDs');
assert.ok(!PlaceOrderInput.safeParse(order([product], { slug: 'Ventos Do Norte!' })).success, 'slug format');
assert.ok(!PlaceOrderInput.safeParse(order([product], { customer: 'Al' })).success, 'name from 3 letters');
assert.ok(PlaceOrderInput.safeParse(order([product], { coupon: 'VENTO10', affiliate: 'BRISA-77' })).success, 'coupon and affiliate code are plain text');
assert.ok(FreeSlotsInput.safeParse({ slug: 'ventos-do-norte', unit: U1, service: S1, instructor: I1, date: '2027-02-01' }).success, 'free slots query');
assert.ok(!FreeSlotsInput.safeParse({ slug: 'ventos-do-norte', unit: U1, service: S1, instructor: I1, date: '01/02/2027' }).success, 'free slots date is ISO');
assert.ok(!FreeSlotsInput.safeParse({ slug: 'ventos-do-norte', unit: U1, service: S1, instructor: I1, date: '2027-02-01', price: 1 }).success, 'free slots takes nothing extra');
assert.ok(CancelInput.safeParse({ number: 'VK-10', token: null, reason: 'Mudei de ideia' }).success, 'a signed-in student cancels without a token');
assert.ok(!CancelInput.safeParse({ number: 'VK-10', token: 'a', reason: 'ab' }).success && !CancelInput.safeParse({ number: 'VK-10', token: 'a', reason: 'Mudei', status: 'delivered' }).success, 'a reason is needed and nothing else is accepted');

// 2. The cart comes back from sessionStorage, which the user can edit. Only valid choices survive.
const cartLine = (n) => ({ key: `p:${n}`, kind: 'product', unit_id: U1, product_id: P1, qty: 1, label: `Produto ${n}` });
assert.deepEqual(sanitizeCart(null), []); assert.deepEqual(sanitizeCart('x'), []); assert.deepEqual(sanitizeCart({}), []);
assert.equal(sanitizeCart([cartLine(1), cartLine(2)]).length, 2, 'valid lines survive');
assert.equal(sanitizeCart([cartLine(1), cartLine(1)]).length, 1, 'duplicate keys collapse');
assert.equal(sanitizeCart(Array.from({ length: 25 }, (_, i) => cartLine(i))).length, MAX_CART_ITEMS, 'never more than ten lines');
assert.equal(sanitizeCart([{ ...cartLine(1), price_cents: 1 }]).length, 0, 'a line carrying a price is dropped');
assert.equal(sanitizeCart([{ ...cartLine(1), qty: 99 }, { ...cartLine(2), unit_id: 'x' }, { kind: 'coupon' }, 7, null]).length, 0, 'tampered lines are dropped');
assert.equal(sanitizeCart([{ key: 'r', kind: 'rental', unit_id: U1, type: 'prancha', hours: 9, qty: 1, label: 'Aluguel' }]).length, 0, 'rental above 8 hours is dropped');
assert.ok(sanitizeCart([{ key: 'l', kind: 'lesson', unit_id: U1, service_id: S1, instructor_id: I1, starts_at: '2027-02-01T08:00:00-03:00', label: 'Aula' }])[0]?.kind === 'lesson', 'a lesson line survives');
const cart = [cartLine(1), { key: 'l', kind: 'lesson', unit_id: U1, service_id: S1, instructor_id: I1, starts_at: '2027-02-01T08:00:00-03:00', label: 'Aula' }];
assert.equal(setLineQty(cart, 'p:1', 3)[0].qty, 3, 'quantity changes');
assert.equal(setLineQty(cart, 'p:1', 0)[0].qty, 1, 'never below 1');
assert.equal(setLineQty(cart, 'p:1', 500)[0].qty, MAX_QTY, 'never above the limit');
assert.equal('qty' in setLineQty(cart, 'l', 5)[1], false, 'a lesson has no quantity');
assert.equal(cart[0].qty, 1, 'the original cart is not mutated');

// 3. Display rules: whole cents, duration as 1h 30min, status in Portuguese.
assert.match(brl(26000), /260,00/); assert.match(brl(5), /0,05/);
assert.equal(minutesLabel(90), '1h 30min'); assert.equal(minutesLabel(120), '2h'); assert.equal(minutesLabel(45), '45min');
assert.equal(rentalName('prancha'), 'Prancha'); assert.equal(rentalName('outro'), 'outro');
assert.equal(statusLabel('received'), 'Recebido, aguardando a escola'); assert.equal(statusLabel('xyz'), 'xyz');

// 4. Every error the database can raise on the public paths reads clearly. Raw database text is never shown.
const generic = friendlyOrderError('zzz');
const sql = read('supabase/migrations/20261116100000_business_public_store.sql');
const phase2 = read('supabase/migrations/20261115130000_business_services_bookings.sql');
const messages = new Set();
const collect = (text, fn) => {
  const start = text.indexOf(`function public.${fn}(`); assert.ok(start >= 0, `${fn} exists`);
  const end = text.indexOf('\n$$;', start);
  for (const m of text.slice(start, end).matchAll(/raise exception '([^']+)'/g)) messages.add(m[1].replace('%', String(MAX_CART_ITEMS)));
};
for (const fn of ['company_place_order', 'create_public_order', 'get_public_order', 'cancel_public_order']) collect(sql, fn);
collect(phase2, 'company_check_slot');
assert.ok(messages.size >= 25, `collected the database messages (${messages.size})`);
const NEVER_FROM_THE_BROWSER = new Set(['Unknown item kind']); // the schema never lets this kind through
for (const msg of messages) {
  const text = friendlyOrderError(msg);
  if (NEVER_FROM_THE_BROWSER.has(msg)) continue;
  assert.notEqual(text, generic, `"${msg}" has its own message`);
  assert.ok(!text.includes(msg) && /[ãáâéêíóôõúç]|\b(de|do|da|o|a|um|este|esta|nessa|nesta|seu|sua|escola|pedido|itens?)\b/i.test(text), `"${msg}" is shown in Portuguese`);
}
assert.match(friendlyOrderError('Coupon expired'), /venceu/); assert.match(friendlyOrderError('Not enough stock in the unit'), /Estoque/);
assert.match(friendlyOrderError('Coupon not found'), /Cupom n/); assert.equal(friendlyOrderError(''), generic);
assert.ok(!friendlyOrderError('duplicate key value violates unique constraint "company_orders_pkey"').includes('duplicate key'), 'raw errors are never echoed');

// 5. Who sees what, from the code.
const actions = read('src/app/actions/public-store.ts');
const lib = read('src/lib/public-store.ts');
const serverLib = read('src/lib/public-store-server.ts');
const client = read('src/app/escola/[slug]/store-client.tsx');
const layout = read('src/app/escola/layout.tsx');
const orderPage = read('src/app/escola/pedido/[number]/page.tsx');
const myOrders = read('src/app/aluno/(app)/pedidos/page.tsx');
const proxy = read('src/proxy.ts');
for (const [name, text] of Object.entries({ actions, lib, serverLib, client })) assert.ok(!/service_role|SERVICE_ROLE/.test(text), `${name} never touches the service-role key`);
assert.ok(!/z\.object\(/.test(actions + lib), 'every schema is strict (strictObject)');
assert.ok(/createSupabaseServerClient\('aluno'\)/.test(actions) && /createSupabaseServerClient\('aluno'\)/.test(serverLib), 'the storefront always uses the signed-in student session, never an elevated client');
assert.ok(/'use server'/.test(actions.split('\n')[0]), 'actions run on the server');
assert.ok(!/(price_cents|total_cents|discount|commission|unit_price)\s*:/.test(client.slice(client.indexOf('function submit()'), client.indexOf('return (', client.indexOf('function submit()')))), 'the submit handler sends no money');
assert.ok(/sanitizeCart\(JSON\.parse/.test(client), 'the cart is validated when restored');
assert.ok(/referrer: 'no-referrer'/.test(layout) && /referrer: 'no-referrer'/.test(orderPage) && /referrer: 'no-referrer'/.test(myOrders), 'order links never leak through Referer');
assert.ok(/robots: \{ index: false/.test(orderPage), 'a link carrying a private token is never indexed');
assert.ok(/\[0-9a-f\]\{64\}/.test(orderPage), 'the token in the URL must look like a 64-hex token');
assert.ok(/requireRole\(\['student'\]/.test(myOrders), 'My orders is only for students');
assert.ok(/'\/escola'/.test(proxy) && !/'\/aluno\/pedidos'/.test(proxy.slice(proxy.indexOf('PUBLIC_PATHS'), proxy.indexOf('\n', proxy.indexOf('PUBLIC_PATHS')))), 'the storefront is public, My orders is not');
assert.ok(/min-height:44px/.test(read('src/app/escola/escola.css').split('\n').find((l) => l.includes('.escola .chip{')) ?? ''), 'chips meet the 44px touch target');

// 6. The database side stays closed: only the intended functions are callable by visitors.
assert.ok(/revoke all on function public\.company_place_order[\s\S]*from public, anon, authenticated;/.test(sql), 'internal functions are revoked from the client');
assert.ok(/grant execute on function public\.set_store_public\(uuid, text, boolean\), public\.my_orders\(\) to authenticated;/.test(sql), 'publishing and my_orders need a signed-in user');
assert.ok(!/grant[^;]*(company_place_order|company_slot_ok|company_published_id|company_public_limits)[^;]*to (anon|authenticated)/.test(sql), 'internal helpers are never granted to the client');

console.log('PASS: student storefront (choices-only input, cart tampering, database messages, visibility and touch targets)');
