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

const levels = { exports: {} };
vm.runInNewContext(transpile(readFileSync(new URL('../src/lib/kite-steps.ts', import.meta.url), 'utf8')), {
  module: levels, exports: levels.exports, require: () => { throw new Error('Unexpected level import'); },
});

const calls = [];
let occupied = [];
let occupiedError = false;
let rpcError = null;
let preferredRpcMissing = false;
let legacyRpcError = null;
let rpcResult;
let viewerRole = 'student';
let studentLevel = 'first_time';
let levelReady = true;
const requestId = '22222222-2222-4222-8222-222222222222';
rpcResult = requestId;
const beachId = '11111111-1111-4111-8111-111111111111';
const db = { async rpc(name, args) {
  calls.push({ name, args });
  if (preferredRpcMissing && name === 'create_instructor_request_with_preference') {
    return { data: null, error: { code: 'PGRST202', message: 'Missing preference RPC' } };
  }
  if (name === 'create_instructor_request') return { data: rpcResult, error: legacyRpcError };
  return { data: rpcResult, error: rpcError };
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
    return { effective: studentLevel, ready: levelReady };
  } },
  '@/lib/kite-steps': levels.exports,
  '@/lib/format': { LESSON_UTC_OFFSET: '-03:00' },
  '@/lib/supabase/server': { async createSupabaseServerClient() { return db; } },
  '@/lib/student-occupied-slots': { async getStudentOccupiedSlots() { if (occupiedError) throw new Error('Occupied lookup unavailable'); return occupied; } },
  '@/lib/student-schedule': schedule.exports,
  '@/lib/booking-mode': { VALIDATION_WITHOUT_CHECKOUT: true },
  './errors': { friendlyError(error) { return error.message; } },
};
const module = { exports: {} };
vm.runInNewContext(transpile(readFileSync(new URL('../src/app/actions/booking.ts', import.meta.url), 'utf8')), {
  // Freeze the action clock: fixture dates must not expire as CI runs on later days.
  module, exports: module.exports,
  Date: class extends Date { static now() { return Date.parse('2026-11-19T08:00:00-03:00'); } },
  JSON, console: { error() {} },
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

// Missing preference wrapper may use only the legacy QUEUE RPC, never a direct booking.
preferredRpcMissing = true;
const beforeLegacy = calls.length;
try {
  await create({}, form());
  assert.fail('Legacy queue success must redirect');
} catch (error) {
  assert.equal(error.message, 'REDIRECT:/aluno/solicitacao/' + requestId);
}
assert.deepEqual(calls.slice(beforeLegacy).map(call => call.name), [
  'create_instructor_request_with_preference', 'create_instructor_request',
]);
assert.deepEqual(Array.from(calls.at(-1).args.p_meetings, m => ({ starts_at: m.starts_at, hours: m.hours })), [
  { starts_at: '2026-11-20T09:00:00-03:00', hours: 2 },
  { starts_at: '2026-11-22T09:00:00-03:00', hours: 2 },
]);

// A preferred instructor must NEVER be silently ignored by legacy fallback.
const beforePreferred = calls.length;
result = await create({}, form({ preferredInstructorId: '33333333-3333-4333-8333-333333333333' }));
assert.match(result.error, /mesmo instrutor depende da atualização/);
assert.equal(calls.length, beforePreferred + 1);
assert.equal(calls.at(-1).name, 'create_instructor_request_with_preference');

// Legacy queue failures and malformed IDs fail closed, with no success redirect.
legacyRpcError = { code: 'TEST_ERROR', message: 'Legacy queue rejected' };
result = await create({}, form());
assert.ok(result.error);
legacyRpcError = null;
rpcResult = 'not-a-request-uuid';
result = await create({}, form());
assert.match(result.error, /Não foi possível abrir a reserva/);
rpcResult = requestId;
preferredRpcMissing = false;

// A present preference RPC must not fall back on an ordinary database error.
const beforeOrdinaryError = calls.length;
rpcError = { code: '42501', message: 'permission denied' };
result = await create({}, form());
assert.ok(result.error);
assert.deepEqual(calls.slice(beforeOrdinaryError).map(call => call.name), [
  'create_instructor_request_with_preference',
]);
rpcError = null;

// An instructor cannot submit a student reservation, even with a valid form.
viewerRole = 'instructor';
await assert.rejects(() => create({}, form()), /Unauthorized/);
assert.equal(calls.length, beforeOrdinaryError + 1);
console.log('PASS: booking negative cases (invalid hours/time/date/instructor, RPC error, role guard)');

console.log('PASS: real student booking action validates 4h/2 dates, hours, civil days and occupied slots before queue RPC (isolated mocks)');

// #90: package sizes, actual level policy and server-derived financial fields.
viewerRole = 'student';
for (const [hours, split] of [[1, [1]], [2, [2]], [4, [2, 2]], [6, [2, 2, 2]], [8, [4, 4]]]) {
  const allocation = split.map((h, i) => ({ date: '2026-11-' + (20 + i * 2), start: '09:00', hours: h }));
  const before = calls.length;
  await assert.rejects(() => create({}, form({ meetings: JSON.stringify(allocation), expectedHours: String(hours),
    language: 'Inglês', totalCents: '1', hourlyRateCents: '1', instructorNetCents: '1' })), /REDIRECT:\/aluno\/solicitacao\//);
  assert.equal(calls.length, before + 1);
  const args = calls.at(-1).args;
  assert.equal(args.p_beach_id, beachId);
  assert.equal(args.p_language, 'Inglês');
  assert.equal(args.p_meetings.reduce((sum, m) => sum + m.hours, 0), hours);
  assert.deepEqual(Object.keys(args).sort(), ['p_beach_id', 'p_level', 'p_language', 'p_meetings', 'p_partner_code', 'p_with_transport', 'p_preferred_instructor_id'].sort(), 'client money must never enter RPC');
}
let beforeValidation = calls.length;
for (const invalid of [{ beachId: 'not-a-uuid' }, { language: 'invalid-language' }, { level: 'invalid-level' },
  { meetings: JSON.stringify([{ ...meetings[0], price: 1 }, meetings[1]]) }]) {
  assert.ok((await create({}, form(invalid))).error);
}
studentLevel = 'improving';
assert.match((await create({}, form({ level: 'first_time' }))).error, /nível atual/);
studentLevel = 'first_time';
levelReady = false;
assert.match((await create({}, form())).error, /configurar seu nível/);
assert.equal(calls.length, beforeValidation, 'invalid selection or unavailable profile must not create request');
levelReady = true;
console.log('PASS: 1/2/4/6/8h allocation, actual level policy, beach/language validation and no client-supplied price forwarded');
