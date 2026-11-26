import assert from 'node:assert/strict';
import { offerForRequest, meetingForBooking } from './e2e/booking-targets.mjs';
const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
function pageOf(rows) {
  return { locator(selector) {
    const attrs = [...selector.matchAll(/\[data-([a-z-]+)="([^"]+)"\]/g)];
    if (!attrs.length) throw new Error('seletor sem identidade');
    const matched = rows.filter(row => attrs.every(([, key, value]) => row[key] === value));
    return { count: async () => matched.length, rows: matched };
  } };
}
const rows = [
  { 'request-id': b, name: 'outra oferta' },
  { 'request-id': a, name: 'oferta correta' },
  { 'booking-id': b, 'meeting-position': '1', name: 'outra reserva' },
  { 'booking-id': a, 'meeting-position': '2', name: 'segundo encontro' },
  { 'booking-id': a, 'meeting-position': '1', name: 'primeiro encontro' },
];
const page = pageOf(rows);
assert.equal((await offerForRequest(page, a)).rows[0].name, 'oferta correta');
assert.equal((await meetingForBooking(page, a, 1)).rows[0].name, 'primeiro encontro');
assert.equal((await meetingForBooking(page, a, 2)).rows[0].name, 'segundo encontro');
assert.equal(await offerForRequest(pageOf([]), a, { allowAbsent: true }), null);
await assert.rejects(offerForRequest(pageOf([]), a), /encontrados 0/);
await assert.rejects(offerForRequest(pageOf([rows[1], rows[1]]), a), /encontrados 2/);
await assert.rejects(meetingForBooking(pageOf([rows[4], rows[4]]), a, 1), /encontrados 2/);
await assert.rejects(meetingForBooking(page, a, 3), /encontrados 0/);
await assert.rejects(meetingForBooking(page, a, '1'), /inválida/);
await assert.rejects(offerForRequest(page, `${a}\"]`), /inválido/);
console.log('E2E booking target isolation checks passed.');
