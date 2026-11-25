import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const requireNode = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/app/actions/instructor.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const meetingId = '11111111-1111-4111-8111-111111111111';
const secondMeetingId = '22222222-2222-4222-8222-222222222222';
const calls = [];
let role = 'instructor';
let rpcError = null;
const db = { async rpc(name, args) { calls.push({ name, args }); return { error: rpcError }; } };
const module = { exports: {} };
const dependencies = {
  'next/cache': { revalidatePath() {} },
  zod: requireNode('zod'),
  '@/lib/auth': { async requireRole(roles) {
    if (!roles.includes(role)) throw new Error('Unauthorized role');
    return { id: 'instructor-test', role };
  } },
  '@/lib/supabase/server': { async createSupabaseServerClient() { return db; } },
  './errors': { friendlyError(error) { return error.message ?? 'Database error'; } },
};
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require(id) {
    if (!(id in dependencies)) throw new Error('Unexpected import: ' + id);
    return dependencies[id];
  },
  console: { error() {} },
}, { filename: 'instructor-actions-isolated.cjs' });

function form(fields) {
  const values = new Map(Object.entries(fields));
  return { get(name) { return values.has(name) ? values.get(name) : null; } };
}
const { startMeeting, recordMeeting, recordMeetingWithSkills } = module.exports;

// First meeting: invalid presence code never reaches the database.
let result = await startMeeting({}, form({ meetingId, presenceCode: '12' }));
assert.ok(result.error);
assert.equal(calls.length, 0);

// Legacy minutes-only form must also reject blank and missing values.
for (const doneMinutes of ['', '   ', null, '1e2', '0x10', '+120', '-0', '0120', '120.0', 'Infinity', 'NaN', ' 120', '120 ', '481']) {
  const before = calls.length;
  result = await recordMeeting({}, form({ meetingId, doneMinutes, note: '' }));
  assert.ok(result.error);
  assert.equal(calls.length, before, 'Empty minutes must not reach record_meeting');
}

// Valid presence calls ONLY the ordered RPC (never legacy start_meeting).
result = await startMeeting({}, form({ meetingId, presenceCode: '1234' }));
assert.ok(result.ok);
assert.equal(calls.at(-1).name, 'start_ordered_meeting');
assert.equal(calls.at(-1).args.p_meeting_id, meetingId);
assert.equal(calls.at(-1).args.p_presence_code, '1234');

// Missing ordered function must fail closed without fallback.
rpcError = { code: 'PGRST202', message: 'Missing RPC' };
const beforeUnavailable = calls.length;
result = await startMeeting({}, form({ meetingId, presenceCode: '1234' }));
assert.ok(result.error);
assert.equal(calls.length, beforeUnavailable + 1);
assert.equal(calls.at(-1).name, 'start_ordered_meeting');
rpcError = null;

const skills = (minutes, overrides = {}) => form({
  meetingId, doneMinutes: String(minutes),
  step1: 'practiced', step2: 'mastered', step3: 'none',
  step4: 'none', step5: 'none', step6: 'none',
  ...overrides,
});
const beforeInvalid = calls.length;
for (const input of [
  skills(120, { step3: 'invalid' }),
  skills(120, { step1: 'none', step2: 'none' }),
  skills(0),
  skills(120, { doneMinutes: '' }),
  skills(120, { doneMinutes: '   ' }),
  skills(120, { doneMinutes: null }),
  ...['1e2', '0x10', '+120', '-0', '0120', '120.0', 'Infinity', 'NaN', ' 120', '120 '].map(doneMinutes => skills(120, { doneMinutes })),
  skills(481),
  skills(-1),
  skills(120, { meetingId: 'not-a-uuid' }),
  skills(120, { step1: 'none', step2: 'none', step3: 'none', step4: 'none', step5: 'none', step6: 'none' }),
  skills(0, { step1: 'practiced' }),
  skills(120, { step4: 'mastered', step5: 'invalid' }),
]) {
  result = await recordMeetingWithSkills({}, input);
  assert.ok(result.error, 'Invalid evolution or minutes must be rejected');
}
assert.equal(calls.length, beforeInvalid, 'Invalid evolution must not reach privileged RPC');

// A malformed meeting ID or presence code must never reach the ordered start RPC.
// Empty minutes must not coerce to zero and silently close a lesson.
const beforeInvalidStart = calls.length;
for (const input of [
  { meetingId: 'not-a-uuid', presenceCode: '1234' },
  { meetingId: secondMeetingId, presenceCode: '12ab' },
  { meetingId: secondMeetingId, presenceCode: '12345' },
]) {
  result = await startMeeting({}, form(input));
  assert.ok(result.error);
}
assert.equal(calls.length, beforeInvalidStart, 'Invalid presence or ID must not reach privileged RPC');

// Second step of the flow: instructor records minutes and evolution atomically.
result = await recordMeetingWithSkills({}, skills(120));
assert.ok(result.ok);
assert.equal(calls.at(-1).name, 'record_meeting_with_skills');
assert.equal(calls.at(-1).args.p_meeting_id, meetingId);
assert.equal(calls.at(-1).args.p_done_minutes, 120);
assert.deepEqual(Array.from(calls.at(-1).args.p_practiced_steps), [1]);
assert.deepEqual(Array.from(calls.at(-1).args.p_mastered_steps), [2]);

// Second encounter in the same four-hour package must preserve its own identity.
// The instructor's form must never silently re-record the first encounter.
const firstMeetingWrites = calls.filter(call => call.name === 'record_meeting_with_skills').length;
result = await startMeeting({}, form({ meetingId: secondMeetingId, presenceCode: '5678' }));
assert.ok(result.ok);
assert.equal(calls.at(-1).name, 'start_ordered_meeting');
assert.equal(calls.at(-1).args.p_meeting_id, secondMeetingId);
result = await recordMeetingWithSkills({}, skills(120, {
  meetingId: secondMeetingId, step1: 'mastered', step2: 'none', step3: 'practiced',
}));
assert.ok(result.ok);
assert.equal(calls.at(-1).name, 'record_meeting_with_skills');
assert.equal(calls.at(-1).args.p_meeting_id, secondMeetingId);
assert.equal(calls.at(-1).args.p_done_minutes, 120);
assert.deepEqual(Array.from(calls.at(-1).args.p_practiced_steps), [3]);
assert.deepEqual(Array.from(calls.at(-1).args.p_mastered_steps), [1]);
assert.equal(calls.filter(call => call.name === 'record_meeting_with_skills').length, firstMeetingWrites + 1);

// A student or admin must never be able to invoke instructor-only privileged RPCs.
const beforeWrongRole = calls.length;
for (const unauthorized of ['student', 'admin', 'affiliate']) {
  role = unauthorized;
  await assert.rejects(() => startMeeting({}, form({ meetingId, presenceCode: '1234' })), /Unauthorized role/);
  await assert.rejects(() => recordMeeting({}, form({ meetingId, doneMinutes: '120', note: '' })), /Unauthorized role/);
  await assert.rejects(() => recordMeetingWithSkills({}, skills(120)), /Unauthorized role/);
}
role = 'instructor';
assert.equal(calls.length, beforeWrongRole, 'Unauthorized roles must not reach either privileged RPC');

// All instructor mutations must propagate database denial without claiming success.
rpcError = { code: '42501', message: 'permission denied for meeting' };
for (const action of [
  () => startMeeting({}, form({ meetingId, presenceCode: '1234' })),
  () => recordMeeting({}, form({ meetingId, doneMinutes: '120', note: '' })),
  () => recordMeetingWithSkills({}, skills(120)),
]) {
  const previousCalls = calls.length;
  result = await action();
  assert.ok(result.error, 'Database permission denial must be visible to the instructor');
  assert.equal(result.ok, undefined, 'Denied database mutation cannot be reported as success');
  assert.equal(calls.length, previousCalls + 1);
}

rpcError = { code: 'TEST_ERROR', message: 'Database rejected meeting' };
result = await recordMeetingWithSkills({}, skills(120));
assert.ok(result.error);
rpcError = null;

console.log('PASS: instructor ordered presence, no legacy fallback, minutes/evolution atomic RPC, malformed skill rejection and database failure (isolated actions)');
