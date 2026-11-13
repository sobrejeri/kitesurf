import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const requireNode = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/app/actions/booking.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const beachId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const future1 = '2099-11-17';
const future2 = '2099-11-19';
const calls = [];
let occupied = [];
let rpcError = null;
let viewerRole = 'student';
const db = { async rpc(name, args) { calls.push({ name, args }); return { data: requestId, error: rpcError }; } };
const deps = {
  'next/cache': { revalidatePath() {} },
  'next/headers': { async cookies() { return { get() { return undefined; } }; } },
  'next/navigation': { redirect(path) { throw Object.assign(new Error('REDIRECT'), { path }); } },
  zod: requireNode('zod'),
  '@/lib/auth': { async requireRole(roles) {
    assert.deepEqual(Array.from(roles), ['student']);
    if (viewerRole !== 'student') throw new Error('Unauthorized');
    return { id: 'student-test', role: 'student' };
  } },
  '@/lib/dates': { lessonDate() { return '2026-11-13'; } },
  '@/lib/student-kite-level': { async getStudentKiteLevel() {
    return { effective: 'first_time', ready: true };
  } },
  '@/lib/kite-steps': { isAllowedLessonLevel() { return true; } },
  '@/lib/format': { LESSON_UTC_OFFSET: '-03:00' },
  '@/lib/supabase/server': { async createSupabaseServerClient() { return db; } },
  '@/lib/student-occupied-slots': { async getStudentOccupiedSlots() { return occupied; } },
  '@/lib/student-schedule': {},
  '@/lib/booking-mode': { VALIDATION_WITHOUT_CHECKOUT: true },
  './errors': { friendlyError(error) { return error.message ?? 'Database error'; } },
};
const scheduleSource = readFileSync(new URL('../src/lib/student-schedule.ts', import.meta.url), 'utf8');
const scheduleModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(scheduleSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: scheduleModule, exports: scheduleModule.exports, require: requireNode, Date, Number }, {
  filename: 'student-schedule.cjs',
});
deps['@/lib/student-schedule'] = scheduleModule.exports;
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports, Date, console: { error() {} },
  require(id) { if (!(id in deps)) throw new Error('Unexpected import: ' + id); return deps[id]; },
}, { filename: 'booking-actions-isolated.cjs' });
const { createBooking } = module.exports;
function form(meetings, overrides = {}) {
  const fields = { beachId, level: 'first_time', language: 'Português',
    meetings: JSON.stringify(meetings), expectedHours: '4', transport: 'no',
    preferredInstructorId: '', ...overrides };
  return { get(name) { return fields[name] ?? null; } };
}
const meeting = (date, start = '09:00', hours = 2) => ({ date, start, hours });
async function submit(meetings, overrides) {
  try { return await createBooking({}, form(meetings, overrides)); }
  catch (error) {
    if (error.path) return { redirect: error.path };
    throw error;
  }
}
const valid = [meeting(future1), meeting(future2)];
let result = await submit(valid);
assert.equal(result.redirect, '/aluno/solicitacao/' + requestId);
assert.equal(calls.length, 1);
assert.equal(calls[0].name, 'create_instructor_request_with_preference');
assert.deepEqual(Array.from(calls[0].args.p_meetings, x => x.hours), [2, 2]);
assert.deepEqual(Array.from(calls[0].args.p_meetings, x => x.starts_at), [
  future1 + 'T09:00:00-03:00', future2 + 'T09:00:00-03:00',
]);
assert.equal(Object.hasOwn(calls[0].args, 'p_total'), false, 'Client price never reaches RPC');
const beforeInvalid = calls.length;
for (const [meetings, overrides] of [
  [[meeting(future1), meeting(future1, '14:00')]],
  [[meeting(future1, '09:00', 3), meeting(future2, '09:00', 2)]],
  [[meeting(future1), meeting(future2)], { expectedHours: '5' }],
  [[meeting('2026-11-01'), meeting(future2)]],
  [[meeting(future1, '25:00'), meeting(future2)]],
  [[meeting(future1), meeting(future2)], { price: '1' }],
]) {
  result = await submit(meetings, overrides);
  assert.ok(result.error, 'Malformed, duplicate-day or tampered booking must be rejected');
}
assert.equal(calls.length, beforeInvalid, 'Invalid booking never invokes privileged RPC');
occupied = [{ startsAt: future1 + 'T09:30:00-03:00', minutes: 60 }];
result = await submit(valid);
assert.ok(result.error);
assert.equal(calls.length, beforeInvalid, 'Existing student schedule conflict blocks submission');
occupied = [];
rpcError = { code: 'TEST_REJECT', message: 'Database rejected booking' };
result = await submit(valid);
assert.ok(result.error);
rpcError = null;
viewerRole = 'instructor';
await assert.rejects(() => createBooking({}, form(valid)), /Unauthorized/);
console.log('PASS: isolated student 4h/2 days booking, strict schema, tampering, duplicate-day, occupied-slot, role and RPC failure checks');
