import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash, timingSafeEqual } from 'node:crypto';
import ts from 'typescript';

const source = readFileSync(new URL('../src/app/api/internal/queue-maintenance/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const environment = { QUEUE_WORKER_ENABLED: 'false', QUEUE_WORKER_TOKEN: 'x'.repeat(48), QUEUE_WORKER_ACTIVATED_AT: '2026-11-13T11:00:00Z',
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
      gte(...a) { ops.push(['gte', ...a]); return q; },
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
    if (id === 'next/server') return { NextResponse: { json(body, { status = 200 } = {}) { return { body, status }; } } };
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
delete environment.QUEUE_WORKER_ACTIVATED_AT;
response = await POST(valid);
assert.equal(response.status, 503, 'Activation timestamp required before processing legacy requests');
assert.equal(queries.length, 0);
environment.QUEUE_WORKER_ACTIVATED_AT = 'not-a-date';
response = await POST(valid);
assert.equal(response.status, 503, 'Malformed activation timestamp must fail closed');
assert.equal(queries.length, 0);
environment.QUEUE_WORKER_ACTIVATED_AT = '2999-01-01T00:00:00Z';
response = await POST(valid);
assert.equal(response.status, 503, 'Future activation must fail closed');
assert.equal(queries.length, 0);
environment.QUEUE_WORKER_ACTIVATED_AT = '2026-11-13T11:00:00Z';
response = await POST(request('Bearer wrong'));
assert.equal(response.status, 401);
assert.equal(queries.length, 0);
response = await POST(valid);
assert.equal(response.status, 200);
assert.deepEqual(rpcCalls, ['a', 'b', 'c'], 'Deduplicate across both batches');
assert.equal(response.body.processed, 3);
assert.ok(queries.every(q => q.some(x => x[0] === 'limit' && x[1] === 20)));
assert.ok(queries.every(q => q.some(x => x[0] === 'gte' && x[1] === 'created_at' && x[2] === environment.QUEUE_WORKER_ACTIVATED_AT)), 'Both queries must exclude legacy requests');
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

const alternativeSource = readFileSync(new URL('../src/app/api/internal/expire-offers/route.ts', import.meta.url), 'utf8');
const alternativeCode = ts.transpileModule(alternativeSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const cutoff = '2026-11-13T11:00:00Z';
const config = { enabled: true, apply: false, secret: 'a'.repeat(48), serviceRoleKey: 'test-only' };
const legacyId = '00000000-0000-4000-8000-000000000001';
const eligibleId = '00000000-0000-4000-8000-000000000002';
const old = '2026-11-13T10:00:00Z';
const recent = '2026-11-13T12:00:00Z';
const alternativeCalls = [];
let alternativeReads = 0;
let nullOffers = false;
const alternativeDb = {
  from(table) {
    alternativeReads++;
    let minCreated;
    let joined = false;
    const q = {
      select(columns) { joined = columns.includes('instructor_requests!inner(created_at)'); return q; },
      in() { return q; }, eq() { return q; }, lte() { return q; }, order() { return q; },
      gte(field, value) {
        assert.equal(field, table === 'instructor_offers' ? 'instructor_requests.created_at' : 'created_at');
        minCreated = Date.parse(value);
        return q;
      },
      limit() {
        if (table === 'instructor_offers') assert.ok(joined, 'Filter on the originating request, not the offer age');
        if (table === 'instructor_offers' && nullOffers) return { data: null, error: null };
        const data = [[legacyId, old], [eligibleId, recent]]
          .filter(([, created]) => minCreated === undefined || Date.parse(created) >= minCreated)
          .map(([id]) => table === 'instructor_offers'
            ? { request_id: id, expires_at: recent }
            : { id, expires_at: recent });
        return { data, error: null };
      },
    };
    return q;
  },
  async rpc(name, args) {
    assert.equal(name, 'advance_instructor_offer');
    alternativeCalls.push(args.p_request_id);
    return { error: null };
  },
};
const alternativeModule = { exports: {} };
vm.runInNewContext(alternativeCode, {
  module: alternativeModule, exports: alternativeModule.exports, process: { env: environment }, Date,
  require(id) {
    if (id === 'node:crypto') return { createHash, timingSafeEqual };
    if (id === '@supabase/supabase-js') return { createClient: () => alternativeDb };
    if (id === '@/lib/offer-worker-env') return { offerWorkerEnv: () => config };
    if (id === 'next/server') return { NextResponse: { json(body, { status = 200 } = {}) { return { body, status }; } } };
    throw new Error('Unexpected import: ' + id);
  },
});
const alternatePost = alternativeModule.exports.POST;
const alternativeValid = request('Bearer ' + config.secret);
for (const date of [undefined, 'bad-date', '2999-01-01T00:00:00Z']) {
  config.activatedAt = date;
  response = await alternatePost(alternativeValid);
  assert.equal(response.status, 503);
}
assert.equal(alternativeReads, 0, 'No database calls before a valid cutoff is configured');
config.activatedAt = cutoff;
response = await alternatePost(alternativeValid);
assert.equal(response.status, 200);
assert.equal(response.body.candidates, 1);
assert.equal(alternativeCalls.length, 0, 'Preview does not run any mutation');
config.apply = true;
response = await alternatePost(alternativeValid);
assert.equal(response.status, 200);
assert.deepEqual(alternativeCalls, [eligibleId], 'Old requests are excluded from both data sources');
nullOffers = true;
response = await alternatePost(alternativeValid);
assert.equal(response.status, 503);
assert.deepEqual(alternativeCalls, [eligibleId], 'An incomplete batch must not mutate');
console.log('PASS: alternate expiry route respects the activation cutoff in preview and apply');
