import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { AFFILIATE_SALES, AFFILIATE_SELECTIONS, COMPANY_AFFILIATES, RATE_VERSIONS, SERVICES, PRODUCTS } from '../src/lib/business/demo.ts';
import { OFFERS, STATE_LABEL, bpsLabel, canAttribute, commissionCents, commissionState, currentRate, eligibleBaseCents, offerName, parsePercentToBps, promotersOf, rateAt, salesInScope, totalsFor, validateCampaign, validateDecision, validateRate } from '../src/lib/business/affiliates.ts';
import { BUSINESS_NAV } from '../src/components/business/nav.ts';

// Business block 8: company affiliates. Commissions follow eligible sales and are never "paid" here.
const read = (p) => readFileSync(p, 'utf8');
const sale = (id) => AFFILIATE_SALES.find((s) => s.id === id);

// 1. The percentage is the one in force on the day of the sale.
assert.equal(rateAt('s-ini', -12), 1200); assert.equal(rateAt('s-ini', -5), 1500); assert.equal(rateAt('s-ini', -70), 1000, 'before its own version: default');
assert.equal(rateAt('p-cam', -4), 800); assert.equal(rateAt('p-pro', -3), 1000, 'no own version: default'); assert.equal(rateAt('shop', 0), 1000);
assert.equal(currentRate('s-ini'), 1500);
assert.equal(rateAt('s-ini', -400), 0, 'no version in force yet: no commission');

// 2. Changes are not retroactive: a new version never rewrites an old sale.
const before = AFFILIATE_SALES.map((s) => commissionCents(s));
const changed = [...RATE_VERSIONS, { id: 'rv-new', scope: 's-ini', bps: 2000, fromOffset: 0 }];
assert.deepEqual(AFFILIATE_SALES.map((s) => commissionCents(s, changed)), before, 'every existing sale keeps its commission');
assert.equal(rateAt('s-ini', 0, changed), 2000); assert.equal(rateAt('s-ini', -1, changed), 1500);
assert.equal(commissionCents({ ...sale('as-2'), dayOffset: 0 }, changed), 5200, 'a sale made after the change uses the new rate');
const defaultChange = [...RATE_VERSIONS, { id: 'rv-d', scope: 'default', bps: 3000, fromOffset: 0 }];
assert.deepEqual(AFFILIATE_SALES.map((s) => commissionCents(s, defaultChange)), before, 'a new default does not touch past sales either');

// 3. Commission is tied to the eligible sale; cancellations and refunds are reflected.
assert.deepEqual(['as-1', 'as-2', 'as-3', 'as-4', 'as-5', 'as-6', 'as-7'].map((id) => commissionCents(sale(id))), [3120, 3900, 960, 350, 0, 3400, 0]);
assert.equal(eligibleBaseCents(sale('as-4')), 3500, 'a partial refund reduces the base');
assert.equal(commissionState(sale('as-4')), 'due'); assert.equal(commissionState(sale('as-5')), 'cancelled');
assert.equal(commissionState(sale('as-7')), 'refunded', 'a full refund reverses it'); assert.equal(commissionState(sale('as-6')), 'expected', 'not yet eligible: only expected');
for (const s of AFFILIATE_SALES) { assert.ok(Number.isInteger(commissionCents(s)) && commissionCents(s) >= 0); assert.ok(commissionCents(s) <= s.baseCents); }
assert.equal(commissionCents({ ...sale('as-1'), refundedCents: 99999 }), 0, 'a refund above the sale cannot go negative');

// 4. Totals separate expected from due and count what was reversed.
const all = new Set(['u-prea', 'u-jeri-centro', 'u-jeri-lagoa']);
const t = totalsFor(salesInScope(all));
assert.deepEqual(t, { sales: 5, baseCents: 101500, expectedCents: 3400, dueCents: 8330, reversedCount: 2 });
assert.equal(totalsFor(salesInScope(new Set(['u-jeri-lagoa']))).sales, 0, 'scope narrows sales');
assert.equal(totalsFor(salesInScope(new Set(['u-jeri-centro']))).reversedCount, 2);

// 5. Never "paid": there is no such state, label or action.
assert.deepEqual(Object.keys(STATE_LABEL).sort(), ['cancelled', 'due', 'expected', 'refunded']);
assert.ok(Object.values(STATE_LABEL).every((l) => !/^pag[ao]$/i.test(l)), 'no label says paid');
for (const s of AFFILIATE_SALES) assert.ok(['expected', 'due', 'cancelled', 'refunded'].includes(commissionState(s)));

// 6. Attribution and selection.
assert.equal(canAttribute('a-1'), true); assert.equal(canAttribute('a-4'), false, 'suspended affiliates earn nothing on new sales'); assert.equal(canAttribute('zz'), false);
for (const s of AFFILIATE_SALES) {
  const a = COMPANY_AFFILIATES.find((x) => x.id === s.affiliateId); assert.ok(a, s.id);
  assert.equal(s.code, s.via === 'link' ? a.code : a.couponCode, `${s.id}: attributed by the affiliate's own link or coupon`);
}
assert.equal(new Set(COMPANY_AFFILIATES.map((a) => a.code)).size, COMPANY_AFFILIATES.length, 'unique tracking codes');
for (const ids of Object.values(AFFILIATE_SELECTIONS)) for (const id of ids) assert.ok(OFFERS.includes(id), id);
assert.equal(promotersOf('s-ini'), 3); assert.equal(promotersOf('p-oc'), 0);
assert.deepEqual(OFFERS, ['shop', ...SERVICES.map((s) => s.id), ...PRODUCTS.map((p) => p.id)]); assert.equal(offerName('shop'), 'Lojinha completa');

// 7. Forms.
assert.equal(parsePercentToBps('12'), 1200); assert.equal(parsePercentToBps('12,5'), 1250); assert.equal(parsePercentToBps('7.5'), 750); assert.equal(parsePercentToBps('12,55'), null); assert.equal(parsePercentToBps('abc'), null);
assert.equal(bpsLabel(1000), '10%'); assert.equal(bpsLabel(1250), '12,5%'); assert.equal(bpsLabel(750), '7,5%');
assert.deepEqual(validateRate({ scope: 's-int', percent: '12,5' }), {}); assert.deepEqual(validateRate({ scope: 'default', percent: '9' }), {});
assert.ok(validateRate({ scope: 's-ini', percent: '15' }).percent, 'same as the one in force'); assert.ok(validateRate({ scope: 'default', percent: '10' }).percent);
assert.ok(validateRate({ scope: 'x', percent: '10' }).scope); assert.ok(validateRate({ scope: 'default', percent: '31' }).percent); assert.ok(validateRate({ scope: 'default', percent: '0,4' }).percent); assert.ok(validateRate({ scope: 'default', percent: '' }).percent);
assert.deepEqual(validateDecision({ decision: 'approve', reason: '' }), {}); assert.ok(validateDecision({ decision: 'decline', reason: 'x' }).reason, 'declining needs a reason');
assert.deepEqual(validateDecision({ decision: 'decline', reason: 'Fora da área.' }), {}); assert.ok(validateDecision({ decision: '', reason: '' }).decision);
const camp = { name: 'Verão', description: '', days: '30', refs: ['s-ini'] };
assert.deepEqual(validateCampaign(camp), {}); assert.ok(validateCampaign({ ...camp, refs: [] }).refs); assert.ok(validateCampaign({ ...camp, refs: ['zzz'] }).refs); assert.ok(validateCampaign({ ...camp, name: 'a' }).name); assert.ok(validateCampaign({ ...camp, days: '0' }).days);

// 8. Honesty and safety guards.
const root = 'src/app/admin/business/afiliados';
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const files = [...walk(root), 'src/lib/business/affiliates.ts', 'src/components/business/affiliate-kit.tsx', 'src/components/business/affiliate-forms.tsx'];
for (const f of files) {
  const s = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.ok(!/service_role|supabase|createClient|fetch\(|process\.env/.test(s), `${f}: no database, secrets or network`);
  assert.ok(!/toFixed|parseFloat/.test(s), `${f}: no floating-point money`);
  assert.ok(!/'paid'|markPaid|createPayment|payout|transfer\(|stripe|mercadopago|pagarme|checkout/i.test(s), `${f}: no payment machinery or paid state`);
}
const pages = walk(root).filter((f) => f.endsWith('page.tsx'));
assert.equal(pages.length, 8, 'eight screens (73 to 80)');
for (const f of pages) assert.match(read(f), /<DemoBanner \/>/, `${f}: demo banner`);
for (const f of ['page.tsx', 'relatorios/page.tsx', 'historico/page.tsx']) assert.match(read(`${root}/${f}`), /<PaymentNotice \/>/, `${f}: says payments are not enabled`);
assert.match(read('src/components/business/affiliate-kit.tsx'), /nenhuma comissão é marcada como paga/);
assert.match(read('src/components/business/affiliate-forms.tsx'), /sem efeito retroativo|mantêm o percentual da época/, 'the rate form states it is not retroactive');
for (const r of ['campanhas', 'selecao', 'comissoes', 'solicitacoes', 'vinculados', 'relatorios', 'historico']) assert.ok(existsSync(`${root}/${r}/page.tsx`), r);
assert.match(read('src/app/admin/business/layout.tsx'), /requireRole\(\['admin'\]/);
for (const href of ['/admin/business/afiliados', '/admin/business/afiliados/comissoes', '/admin/business/afiliados/relatorios']) assert.ok(BUSINESS_NAV.some((n) => n.href === href), href);

console.log('PASS: business affiliates (frozen rates, no retroactive change, refunds reflected, nothing marked paid)');
