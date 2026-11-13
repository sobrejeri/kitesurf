import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, timingSafeEqual } from 'node:crypto';
import ts from 'typescript';

const source = readFileSync(new URL('../src/app/api/internal/queue-maintenance/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const environment = { QUEUE_WORKER_ENABLED: 'false', QUEUE_WORKER_TOKEN: 'x'.repeat(48),
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.invalid', SUPABASE_SECRET_KEY: 'test-only' };
const queries = [];
const rpcCalls = [];
let expired = { data: [{ id: 'a' }, { id: 'b' }, { id: 'a' }], error: null };
let active = { data: [{ id: 'b' }, { id: 'c' }], error: null };
let rpcErrorId = null;
const db = {
  from(table) {
    assert.equal(table, 'instructor_requests');
    const ops = [];
    const q = {
      select(...a) { ops.push(['select', ...a]); return q; },
      eq(...a) { ops.push(['eq', ...a]); return q; },
      lte(...a) { ops.push(['lte', ...a]); return q; },
      gt(...a) { ops.push(['gt', ...a]); return q; },
      order(...a) { ops.push(['order', ...a]); return q; },
      limit(...a) { ops.push(['limit', ...a]); queries.push(ops); return Promise.resolve(ops.some(x => x[0] === 'lte') ? expired : active); },
    };
    return q;
  },
  async rpc(name, args) {
    assert.equal(name, 'advance_instructor_offer');
    rpcCalls.push(args.p_request_id);
    return { error: args.p_request_id === rpcErrorId ? { code: 'TEST' } : null };
  },
};
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports, process: { env: environment }, createHash, timingSafeEqual, Date,
  console: { error() {} },
  require(id) {
    if (id === 'server-only') return {};
    if (id === 'node:crypto') return { createHash, timingSafeEqual };
    if (id === '@supabase/supabase-js') return { createClient() { return db; } };
    if (id === 'next/server') return { NextResponse: { json(body, { status }) { return { body, status }; } } };
    throw new Error('Unexpected import: ' + id);
  },
});
const { POST } = module.exports;
const request = token => ({ headers: { get(key) { assert.equal(key, 'authorization'); return token; } } });
const valid = request('Bearer ' + environment.QUEUE_WORKER_TOKEN);
let response = await POST(valid);
assert.equal(response.status, 503, 'Worker disabled by default');
assert.equal(queries.length, 0);
environment.QUEUE_WORKER_ENABLED = 'true';
response = await POST(request('Bearer wrong'));
assert.equal(response.status, 401);
assert.equal(queries.length, 0);
response = await POST(valid);
assert.equal(response.status, 200);
assert.deepEqual(rpcCalls, ['a', 'b', 'c'], 'Deduplicate across both batches');
assert.equal(response.body.processed, 3);
assert.ok(queries.every(q => q.some(x => x[0] === 'limit' && x[1] === 20)));
assert.ok(queries.every(q => q.some(x => x[0] === 'eq' && x[1] === 'status' && x[2] === 'searching')));
rpcCalls.length = 0;
expired = { data: null, error: null };
response = await POST(valid);
assert.equal(response.status, 500, 'Null expired query must fail closed');
assert.equal(rpcCalls.length, 0);
expired = { data: [{ id: 'a' }], error: null };
active = { data: null, error: null };
response = await POST(valid);
assert.equal(response.status, 500, 'Null active query must fail closed');
assert.equal(rpcCalls.length, 0);
active = { data: [{ id: 'a' }, { id: 'b' }], error: null };
rpcErrorId = 'b';
response = await POST(valid);
assert.equal(response.status, 503, 'RPC failures must be reported');
assert.equal(response.body.failed, 1);
console.log('PASS: queue worker disabled, authorized, bounded, deduplicated and fail-closed on selection/RPC errors');
