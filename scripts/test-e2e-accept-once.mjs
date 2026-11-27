import assert from 'node:assert/strict';
import { acceptOfferOnce, bookingForRequest, presenceCodeForConfirmedBooking,verifyCheckpointBooking } from './e2e/accept-offer-once.mjs';
const requestId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const bookingId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const base = 'https://example.invalid';
function requestPage({ path = `/aluno/solicitacao/${requestId}`, href = `/aluno/reserva/${bookingId}`, count = 1 } = {}) {
  return { url: () => base + path, getByRole(role, options) {
    assert.equal(role, 'link'); assert.equal(options.name, 'Ver minha reserva'); assert.equal(options.exact, true);
    return { count: async () => count, getAttribute: async () => href };
  } };
}
assert.deepEqual(await bookingForRequest(requestPage(), base, requestId), { bookingId, bookingUrl: base + '/aluno/reserva/' + bookingId });
assert.equal(await bookingForRequest(requestPage({ count: 0 }), base, requestId), null);
await assert.rejects(bookingForRequest(requestPage({ count: 2 }), base, requestId), /encontrados 2/);
await assert.rejects(bookingForRequest(requestPage({ path: '/aluno/solicitacao/' + bookingId }), base, requestId), /não corresponde/);
for (const href of [null, 'https://attacker.invalid/aluno/reserva/' + bookingId, '/aluno/reserva/bad-id', '/aluno/reserva/' + bookingId + '?other=1']) {
  await assert.rejects(bookingForRequest(requestPage({ href }), base, requestId));
}

for(const count of [0,1]) {
  const page=requestPage({count});
  page.goto=async(url)=>assert.equal(url,base+'/aluno/solicitacao/'+requestId);
  if(count)assert.deepEqual(await verifyCheckpointBooking(page,base,{requestId,bookingId}),{baseOrigin:base,requestId,bookingId});
  else await assert.rejects(verifyCheckpointBooking(page,base,{requestId,bookingId}),/não comprova/);
}
const foreign=requestPage({href:'/aluno/reserva/'+requestId});foreign.goto=async()=>{};
await assert.rejects(verifyCheckpointBooking(foreign,base,{requestId,bookingId}),/não comprova/);

function harness({ appearsAt = 2, acceptedAt = 4, duplicateButtons = false, clickError = false } = {}) {
  let time = 0, clicks = 0, searches = 0, reads = 0;
  const card = { getByRole(role, options) {
    assert.equal(role, 'button'); assert.equal(options.name, 'Aceitar aula'); assert.equal(options.exact, true);
    return { count: async () => duplicateButtons ? 2 : 1, click: async () => {
      clicks += 1; if (clickError) throw new Error('response lost');
    } };
  } };
  return {
    options: {
      findOffer: async () => { searches += 1; return searches >= appearsAt ? card : null; },
      // Simulate a persisted booking whose acceptance is visible only later.
      // No toast or unrelated page text is consulted by this protocol.
      readAcceptedBooking: async () => { reads += 1; return reads >= acceptedAt ? { bookingId } : null; },
      timeout: 10, confirmationTimeout: 10, every: 2,
      now: () => time, sleep: async (ms) => { time += ms; },
    },
    state: () => ({ clicks, searches, reads }),
  };
}
const delayed = harness();
assert.deepEqual(await acceptOfferOnce(delayed.options), { bookingId });
assert.deepEqual(delayed.state(), { clicks: 1, searches: 2, reads: 4 });
const unknown = harness({ acceptedAt: Infinity });
await assert.rejects(acceptOfferOnce(unknown.options), /não repetir/);
assert.equal(unknown.state().clicks, 1);
assert.equal(unknown.state().reads, 6);
const noOffer = harness({ appearsAt: Infinity });
await assert.rejects(acceptOfferOnce(noOffer.options), /nenhuma oferta/);
assert.equal(noOffer.state().clicks, 0);
assert.equal(noOffer.state().reads, 0);
const duplicate = harness({ duplicateButtons: true });
await assert.rejects(acceptOfferOnce(duplicate.options), /encontrados 2/);
assert.equal(duplicate.state().clicks, 0);
const lost = harness({ clickError: true });
await assert.rejects(acceptOfferOnce(lost.options), /response lost/);
assert.equal(lost.state().clicks, 1);
assert.equal(lost.state().reads, 0);

function voucherPage({ statusCount = 1, codes = ['1234', '1234'], statusError = false } = {}) {
  return { locator(selector) {
    assert.equal(selector, '.vento-voucher');
    return { count: async () => 1, getByText(label, options) {
      assert.equal(label, 'Confirmada'); assert.equal(options.exact, true);
      return { count: async () => statusCount, waitFor: async () => { if (statusError) throw new Error('not confirmed'); } };
    }, locator(inner) { assert.equal(inner, '.vento-voucher-code'); return { allTextContents: async () => codes }; } };
  } };
}
assert.equal(await presenceCodeForConfirmedBooking(voucherPage()), '1234');
for (const config of [{statusCount: 0}, {statusCount: 2}, {statusError: true}, {codes: []}, {codes: ['1234','5678']}, {codes: ['code']}]) {
  await assert.rejects(presenceCodeForConfirmedBooking(voucherPage(config)));
}
console.log('PASS: late/absent acceptance never repeats writes; booking identity and exact confirmed status required.');

