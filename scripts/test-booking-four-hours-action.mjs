import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const requireNode = createRequire(import.meta.url);
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const schedule = { exports: {} };
vm.runInNewContext(transpile(readFileSync(new URL('../src/lib/student-schedule.ts', import.meta.url), 'utf8')), {
  module: schedule, exports: schedule.exports, require: () => { throw new Error('Unexpected schedule import'); }, Date,
});

const calls = [];
let occupied = [];
let occupiedError = false;
let rpcError = null;
let viewerRole = 'student';
const requestId = '22222222-2222-4222-8222-222222222222';
const beachId = '11111111-1111-4111-8111-111111111111';
const db = { async rpc(name, args) {
  calls.push({ name, args });
  return { data: requestId, error: rpcError };
} };
const deps = {
  'next/cache': { revalidatePath() {} },
  'next/headers': { async cookies() { return { get() { return undefined; } }; } },
  'next/navigation': { redirect(url) { throw new Error('REDIRECT:' + url); } },
  zod: requireNode('zod'),
  '@/lib/auth': { async requireRole(roles) {
    assert.deepEqual(Array.from(roles), ['student']);
    if (viewerRole !== 'student') throw new Error('Unauthorized');
    return { id: 'test-student', role: 'student' };
  } },
  '@/lib/dates': { lessonDate() { return '2026-11-13'; } },
  '@/lib/student-kite-level': { async getStudentKiteLevel() {
    return { effective: 'first_time', ready: true };
  } },
  '@/lib/kite-steps': { isAllowedLessonLevel() { return true; } },
  '@/lib/format': { LESSON_UTC_OFFSET: '-03:00' },
  '@/lib/supabase/server': { async createSupabaseServerClient() { return db; } },
  '@/lib/student-occupied-slots': { async getStudentOccupiedSlots() { if (occupiedError) throw new Error('Occupied lookup unavailable'); return occupied; } },
  '@/lib/student-schedule': schedule.exports,
  '@/lib/booking-mode': { VALIDATION_WITHOUT_CHECKOUT: true },
  './errors': { friendlyError(error) { return error.message; } },
};
const module = { exports: {} };
vm.runInNewContext(transpile(readFileSync(new URL('../src/app/actions/booking.ts', import.meta.url), 'utf8')), {
  module, exports: module.exports, Date, JSON, console: { error() {} },
  require(id) {
    if (!(id in deps)) throw new Error('Unexpected import: ' + id);
    return deps[id];
  },
}, { filename: 'booking-action-isolated.cjs' });

const meetings = [
  { date: '2026-11-20', start: '09:00', hours: 2 },
  { date: '2026-11-22', start: '09:00', hours: 2 },
];
const form = (updates = {}) => {
  const fields = { beachId, level: 'first_time', language: 'Português',
    meetings: JSON.stringify(meetings), expectedHours: '4',
    transport: 'no', preferredInstructorId: '', ...updates };
  return { get(name) { return fields[name] ?? null; } };
};
const create = module.exports.createBooking;
let result;
try {
  await create({}, form());
  assert.fail('Successful request must redirect to its request status');
} catch (error) {
  assert.equal(error.message, 'REDIRECT:/aluno/solicitacao/' + requestId);
}
assert.equal(calls.length, 1);
assert.equal(calls[0].name, 'create_instructor_request_with_preference');
assert.deepEqual(Array.from(calls[0].args.p_meetings, m => ({ starts_at: m.starts_at, hours: m.hours })), [
  { starts_at: '2026-11-20T09:00:00-03:00', hours: 2 },
  { starts_at: '2026-11-22T09:00:00-03:00', hours: 2 },
]);

// Repeated civil day is forbidden even when hours do not overlap.
result = await create({}, form({ meetings: JSON.stringify([
  meetings[0], { date: '2026-11-20', start: '13:00', hours: 2 },
]) }));
assert.match(result.error, /apenas um encontro por dia/);
assert.equal(calls.length, 1);

result = await create({}, form({ expectedHours: '6' }));
assert.match(result.error, /exatamente as 6h/);
assert.equal(calls.length, 1);

result = await create({}, form({ meetings: JSON.stringify([
  { ...meetings[0], date: '2026-02-30' }, meetings[1],
]) }));
assert.ok(result.error);
assert.equal(calls.length, 1);

// Existing or pending occupied student slot must reject a forged browser submission.
occupied = [{ startsAt: '2026-11-20T09:30:00-03:00', minutes: 60 }];
result = await create({}, form());
assert.match(result.error, /já tem uma aula ou uma busca/);
assert.equal(calls.length, 1);

// Negative cases that must not reach the privileged queue RPC.
occupied = [];
for (const updates of [
  { meetings: JSON.stringify([{ ...meetings[0], hours: 3 }, meetings[1]]) },
  { meetings: JSON.stringify([{ ...meetings[0], start: '25:00' }, meetings[1]]) },
  { meetings: JSON.stringify([{ ...meetings[0], date: '2026-11-01' }, meetings[1]]) },
  { preferredInstructorId: 'invalid-uuid' },
]) {
  result = await create({}, form(updates));
  assert.ok(result.error, 'Invalid booking must fail before RPC');
}
assert.equal(calls.length, 1);

// A failed occupied-slot lookup must fail closed, never bypass schedule conflicts.
occupiedError = true;
result = await create({}, form());
assert.match(result.error, /Não foi possível conferir sua agenda/);
assert.equal(calls.length, 1);
occupiedError = false;

// Privileged RPC rejection must not redirect or report success.
rpcError = { code: 'TEST_ERROR', message: 'Database rejected booking' };
result = await create({}, form());
assert.ok(result.error);
assert.equal(calls.length, 2);
rpcError = null;

// An instructor cannot submit a student reservation, even with a valid form.
viewerRole = 'instructor';
await assert.rejects(() => create({}, form()), /Unauthorized/);
assert.equal(calls.length, 2);
console.log('PASS: booking negative cases (invalid hours/time/date/instructor, RPC error, role guard)');

console.log('PASS: real student booking action validates 4h/2 dates, hours, civil days and occupied slots before queue RPC (isolated mocks)');
