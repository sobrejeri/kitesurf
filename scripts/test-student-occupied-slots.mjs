import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/student-occupied-slots.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const studentId = '11111111-1111-4111-8111-111111111111';
const now = Date.now();
const calls = [];
const responses = {
  bookings: { data: [
    { id: 'confirmed', status: 'confirmed', created_at: new Date(now - 86_400_000).toISOString() },
    { id: 'recent', status: 'awaiting_payment', created_at: new Date(now - 60_000).toISOString() },
    { id: 'stale', status: 'awaiting_payment', created_at: new Date(now - 86_400_000).toISOString() },
  ], error: null },
  instructor_requests: { data: [
    { meetings: [{ starts_at: '2099-11-18T09:00:00-03:00', hours: 2 }] },
  ], error: null },
  booking_meetings: { data: [
    { starts_at: '2099-11-17T09:00:00-03:00', minutes: 120 },
  ], error: null },
};
function query(table) {
  const filters = [];
  const q = {
    select(fields) { filters.push(['select', fields]); return q; },
    eq(field, value) { filters.push(['eq', field, value]); return q; },
    in(field, values) { filters.push(['in', field, values]); return q; },
    gt(field, value) { filters.push(['gt', field, value]); return q; },
    returns() { return q; },
    then(resolve, reject) { calls.push({ table, filters }); return Promise.resolve(responses[table]).then(resolve, reject); },
  };
  return q;
}
const db = { from: query };
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports, Date, Promise, console: { error() {} },
  require(id) {
    if (id === 'server-only') return {};
    if (id === './supabase/server') return { async createSupabaseServerClient() { return db; } };
    throw new Error('Unexpected import ' + id);
  },
}, { filename: 'student-occupied-slots.cjs' });
const { getStudentOccupiedSlots } = module.exports;
let slots = await getStudentOccupiedSlots(studentId);
assert.deepEqual(JSON.parse(JSON.stringify(slots)), [
  { startsAt: '2099-11-17T09:00:00-03:00', minutes: 120 },
  { startsAt: '2099-11-18T09:00:00-03:00', minutes: 120 },
]);
assert.equal(calls.length, 3);
assert.deepEqual(calls.filter(x => x.table !== 'booking_meetings').map(x =>
  x.filters.find(f => f[0] === 'eq' && f[1] === 'student_id')?.[2]), [studentId, studentId]);
assert.deepEqual(calls.find(x => x.table === 'booking_meetings').filters.find(f => f[0] === 'in' && f[1] === 'booking_id')[2], ['confirmed', 'recent']);
assert.ok(calls.find(x => x.table === 'instructor_requests').filters.some(f => f[0] === 'eq' && f[1] === 'status' && f[2] === 'searching'));

for (const table of ['bookings', 'instructor_requests', 'booking_meetings']) {
  const original = responses[table];
  responses[table] = { data: null, error: { code: 'TEST', message: 'Unavailable' } };
  await assert.rejects(() => getStudentOccupiedSlots(studentId), /Não foi possível conferir/);
  responses[table] = original;
}
for (const table of ['bookings', 'instructor_requests', 'booking_meetings']) {
  const original = responses[table];
  responses[table] = { data: null, error: null };
  await assert.rejects(() => getStudentOccupiedSlots(studentId), /Não foi possível conferir/,
    'Null query results must never be mistaken for an empty student schedule');
  responses[table] = original;
}
console.log('PASS: occupied student schedule reads ownership, filters stale bookings, includes active requests and fails closed on all three query errors');
