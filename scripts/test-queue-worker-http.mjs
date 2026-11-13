import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real route handler in an isolated module sandbox. No network,
// production credentials, or database connections are used.
const source = readFileSync(new URL('../src/app/api/internal/queue-maintenance/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const TOKEN = 'test-only-token-with-at-least-thirty-two-characters';
const SUPABASE_URL = 'https://example.invalid';
const makeQuery = (rows, error = null) => ({
  select() { return this; },
  eq() { return this; },
  lte() { return this; },
  gt() { return this; },
  order() { return this; },
  limit(n) { assert.equal(n, 20); return Promise.resolve({ data: rows.slice(0, n), error }); },
});
async function invoke({ enabled = 'true', authorization = 'Bearer ' + TOKEN,
  secret = 'test-only-secret', expired = [], active = [], expiredError = null,
  activeError = null, rpcErrors = {} } = {}) {
  const calls = [];
  let selections = 0;
  const db = {
    from(table) {
      assert.equal(table, 'instructor_requests');
      const i = selections++;
      return makeQuery(i === 0 ? expired : active, i === 0 ? expiredError : activeError);
    },
    async rpc(name, args) {
      assert.equal(name, 'advance_instructor_offer');
      calls.push(args.p_request_id);
      return { error: rpcErrors[args.p_request_id] ?? null };
    },
  };
  const env = {
    QUEUE_WORKER_ENABLED: enabled,
    QUEUE_WORKER_TOKEN: TOKEN,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    SUPABASE_SECRET_KEY: secret,
  };
  const module = { exports: {} };
  const fakeRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === 'node:crypto') return { createHash, timingSafeEqual };
    if (id === '@supabase/supabase-js') return { createClient: (url, key) => {
      assert.equal(url, SUPABASE_URL);
      assert.equal(key, secret);
      return db;
    } };
    if (id === 'next/server') return { NextResponse: {
      json(body, { status }) { return { status, body }; },
    } };
    throw new Error('Unexpected import: ' + id);
  };
  const sandbox = { module, exports: module.exports, require: fakeRequire,
    process: { env }, Date, console: { error() {} } };
  vm.runInNewContext(compiled, sandbox, { filename: 'queue-maintenance-route.cjs' });
  const response = await module.exports.POST({
    headers: { get(name) { assert.equal(name, 'authorization'); return authorization; } },
  });
  return { status: response.status, body: JSON.parse(JSON.stringify(response.body)), calls, selections };
}

const disabled = await invoke({ enabled: 'false' });
assert.equal(disabled.status, 503);
assert.deepEqual(disabled.calls, []);
assert.equal(disabled.selections, 0);

for (const authorization of [null, '', 'Bearer wrong', 'Basic ' + TOKEN]) {
  const denied = await invoke({ authorization });
  assert.equal(denied.status, 401);
  assert.deepEqual(denied.calls, []);
}
const missingSecret = await invoke({ secret: '' });
assert.equal(missingSecret.status, 503);
assert.equal(missingSecret.selections, 0);

const ok = await invoke({ expired: [{ id: 'expired-a' }], active: [{ id: 'active-b' }] });
assert.equal(ok.status, 200);
assert.deepEqual(ok.body, { processed: 2, failed: 0 });
assert.deepEqual(ok.calls, ['expired-a', 'active-b']);

const failedSelection = await invoke({ expiredError: { code: 'TEST_FAILURE' } });
assert.equal(failedSelection.status, 500);
assert.deepEqual(failedSelection.calls, []);
const failedActiveSelection = await invoke({ activeError: { code: 'TEST_FAILURE' } });
assert.equal(failedActiveSelection.status, 500);
assert.deepEqual(failedActiveSelection.calls, []);

const partial = await invoke({ expired: [{ id: 'a' }, { id: 'b' }],
  rpcErrors: { b: { code: 'TEST_FAILURE' } } });
assert.equal(partial.status, 503);
assert.deepEqual(partial.body, { processed: 1, failed: 1 });
assert.deepEqual(partial.calls, ['a', 'b']);

const batch = await invoke({
  expired: Array.from({ length: 25 }, (_, i) => ({ id: 'expired-' + i })),
  active: Array.from({ length: 25 }, (_, i) => ({ id: 'active-' + i })),
});
assert.equal(batch.status, 200);
assert.deepEqual(batch.body, { processed: 40, failed: 0 });
assert.equal(batch.calls.length, 40);
assert.equal(new Set(batch.calls).size, 40, 'A batch must not process a request twice');

console.log('PASS: queue maintenance HTTP handler fail-closed, authentication, selection errors, RPC partial failure and bounded query contract (isolated mocks)');
