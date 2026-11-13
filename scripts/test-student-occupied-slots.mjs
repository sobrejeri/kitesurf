import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/student-occupied-slots.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
let bookings = { data: [], error: null };
let requests = { data: [], error: null };
let meetings = { data: [], error: null };
let meetingReads = 0;
const table = (name) => {
  const query = {
    select() { return this; }, eq() { return this; }, in() { return this; },
    gt() { return this; },
    returns() { return Promise.resolve(name === 'instructor_requests' ? requests : meetings); },
    then(resolve, reject) { return Promise.resolve(bookings).then(resolve, reject); },
  };
  if (name === 'booking_meetings') meetingReads++;
  if (!['bookings', 'instructor_requests', 'booking_meetings'].includes(name)) throw Error(name);
  return query;
};
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports, Date, console: { error() {} },
  require(id) {
    if (id === 'server-only') return {};
    if (id === './supabase/server') return { async createSupabaseServerClient() {
      return { from: table };
    } };
    throw new Error('Unexpected import: ' + id);
  },
});
const get = module.exports.getStudentOccupiedSlots;
assert.deepEqual(Array.from(await get('student-test')), []);
for (const invalid of [null, undefined]) {
  bookings = { data: invalid, error: null };
  await assert.rejects(get('student-test'), /agenda/);
  bookings = { data: [], error: null };
  requests = { data: invalid, error: null };
  await assert.rejects(get('student-test'), /agenda/);
  requests = { data: [], error: null };
}
requests = { data: [{ meetings: null }], error: null };
await assert.rejects(get('student-test'), /horários/);
requests = { data: [{ meetings: [{ starts_at: '2099-11-17T09:00:00-03:00', hours: 0 }] }], error: null };
await assert.rejects(get('student-test'), /horários/);
requests = { data: [{ meetings: [{ starts_at: '2099-11-17T09:00:00-03:00', hours: 2 }] }], error: null };
const valid = await get('student-test');
assert.equal(valid.length, 1);
assert.equal(valid[0].minutes, 120);
requests = { data: [], error: null };
bookings = { data: [{ id: 'booking-test', status: 'confirmed', created_at: '2026-11-13T00:00:00Z' }], error: null };
meetings = { data: null, error: null };
await assert.rejects(get('student-test'), /encontros/);
meetings = { data: [{ starts_at: '2099-11-19T09:00:00-03:00', minutes: -1 }], error: null };
await assert.rejects(get('student-test'), /horários/);
meetings = { data: [{ starts_at: '2099-11-19T09:00:00-03:00', minutes: 120 }], error: null };
assert.equal((await get('student-test')).length, 1);
assert.ok(meetingReads > 0);
console.log('PASS: occupied schedule reads fail closed on null and malformed rows, preserve valid meetings (isolated Supabase)');
