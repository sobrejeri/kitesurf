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
const meetingId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const calls = [];
let rpcError = null;
let role = 'student';
const db = { async rpc(name, args) { calls.push({ name, args }); return { error: rpcError }; } };
const deps = {
  'next/cache': { revalidatePath() {} },
  zod: requireNode('zod'),
  '@/lib/auth': { async requireRole(roles) {
    assert.ok(roles.includes(role));
    return { id: 'test-actor', role };
  } },
  '@/lib/supabase/server': { async createSupabaseServerClient() { return db; } },
  '@/lib/student-schedule': schedule.exports,
  './errors': { friendlyError(error) { return error.message; } },
};
const module = { exports: {} };
vm.runInNewContext(transpile(readFileSync(new URL('../src/app/actions/meeting-change.ts', import.meta.url), 'utf8')), {
  module, exports: module.exports, Date, console: { error() {} },
  require(id) {
    if (!(id in deps)) throw new Error('Unexpected import: ' + id);
    return deps[id];
  },
}, { filename: 'meeting-change-isolated.cjs' });
const form = (fields) => ({ get(name) { return fields[name] ?? null; } });
const proposal = (proposedDate) => form({
  meetingId, bookingId, proposedDate, reason: 'Vento forte na praia',
});
const { requestMeetingChange, respondMeetingChange, resolveStudentChange } = module.exports;
const invalid = [
  '2026-02-30T10:00',
  '2026-04-31T10:00',
  '2026-11-01T10:00',
  '2026-12-01T24:00',
  '2026-12-01T10:60',
];
for (const date of invalid) {
  const result = await requestMeetingChange({}, proposal(date));
  assert.ok(result.error, 'Reject impossible, past or malformed date: ' + date);
}
assert.equal(calls.length, 0, 'Invalid date cannot call privileged RPC');

let result = await requestMeetingChange({}, proposal('2026-12-01T10:00'));
assert.ok(result.ok);
assert.equal(calls.at(-1).name, 'request_meeting_change');
assert.equal(calls.at(-1).args.p_meeting_id, meetingId);
assert.equal(calls.at(-1).args.p_new_start, '2026-12-01T10:00:00-03:00');
assert.equal(calls.at(-1).args.p_reason, 'Vento forte na praia');

result = await respondMeetingChange({}, form({ requestId, bookingId, decision: 'accept' }));
assert.ok(result.ok);
assert.equal(calls.at(-1).name, 'respond_meeting_change');
assert.equal(calls.at(-1).args.p_accept, true);

result = await respondMeetingChange({}, form({ requestId, bookingId, decision: 'reject' }));
assert.ok(result.ok);
assert.equal(calls.at(-1).args.p_accept, false);

result = await respondMeetingChange({}, form({ requestId, bookingId, decision: 'invalid' }));
assert.ok(result.error);
assert.equal(calls.at(-1).args.p_accept, false);

result = await resolveStudentChange({}, form({ requestId, bookingId, choice: 'replace' }));
assert.ok(result.ok);
assert.equal(calls.at(-1).name, 'resolve_student_change');
assert.equal(calls.at(-1).args.p_choice, 'replace');

rpcError = { code: 'TEST_FAILURE', message: 'Forbidden' };
result = await requestMeetingChange({}, proposal('2026-12-01T10:00'));
assert.equal(result.error, 'Forbidden');
rpcError = null;

console.log('PASS: reschedule civil dates/72h, Ceará timezone, accept/reject and student replacement server actions (isolated mocks)');
