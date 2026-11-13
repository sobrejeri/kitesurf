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
const calls = [];
let role = 'instructor';
let rpcError = null;
const db = { async rpc(name, args) { calls.push({ name, args }); return { error: rpcError }; } };
const module = { exports: {} };
const dependencies = {
  'next/cache': { revalidatePath() {} },
  zod: requireNode('zod'),
  '@/lib/auth': { async requireRole(roles) {
    assert.ok(roles.includes(role), 'Only expected roles may invoke meeting actions');
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
const { startMeeting, recordMeetingWithSkills } = module.exports;

// First meeting: invalid presence code never reaches the database.
let result = await startMeeting({}, form({ meetingId, presenceCode: '12' }));
assert.ok(result.error);
assert.equal(calls.length, 0);

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
  skills(481),
  skills(-1),
]) {
  result = await recordMeetingWithSkills({}, input);
  assert.ok(result.error, 'Invalid evolution or minutes must be rejected');
}
assert.equal(calls.length, beforeInvalid, 'Invalid evolution must not reach privileged RPC');

// Second step of the flow: instructor records minutes and evolution atomically.
result = await recordMeetingWithSkills({}, skills(120));
assert.ok(result.ok);
assert.equal(calls.at(-1).name, 'record_meeting_with_skills');
assert.equal(calls.at(-1).args.p_meeting_id, meetingId);
assert.equal(calls.at(-1).args.p_done_minutes, 120);
assert.deepEqual(Array.from(calls.at(-1).args.p_practiced_steps), [1]);
assert.deepEqual(Array.from(calls.at(-1).args.p_mastered_steps), [2]);

rpcError = { code: 'TEST_ERROR', message: 'Database rejected meeting' };
result = await recordMeetingWithSkills({}, skills(120));
assert.ok(result.error);
rpcError = null;

console.log('PASS: instructor ordered presence, no legacy fallback, minutes/evolution atomic RPC, malformed skill rejection and database failure (isolated actions)');
