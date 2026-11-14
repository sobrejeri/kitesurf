import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync('src/app/api/internal/expire-offers/route.ts', 'utf8');
const config = readFileSync('src/lib/offer-worker-env.ts', 'utf8');
for (const guard of [
  'offerWorkerEnv()', '!config.apply', 'config.secret', 'config.serviceRoleKey',
  'timingSafeEqual', '.slice(0, 10)', 'advance_instructor_offer', "mode: 'preview'",
  ".order('expires_at', { ascending: true })", 'candidates.sort(', 'new Set(candidates.map(',
]) assert.ok(code.includes(guard), 'missing safety guard: ' + guard);
for (const name of [
  'VENTO_OFFER_WORKER_ENABLED', 'VENTO_OFFER_WORKER_APPLY',
  'VENTO_OFFER_WORKER_SECRET', 'SUPABASE_SERVICE_ROLE_KEY',
]) assert.ok(config.includes(name), 'missing server-only env: ' + name);
assert.ok(config.includes("import 'server-only'"));
assert.ok(!code.includes('export async function GET'));
console.log('Offer expiry worker safety checks passed (static only; no live calls).');

// Exercise the exact identifier predicate used before privileged RPC calls.
const idPattern = code.match(/\.filter\(\(candidate\) =>[^\n]+(\/\^\[0-9a-f\].+?\/i)\.test\(candidate\.id\)\)/)?.[1];
assert.ok(idPattern, 'worker must validate UUID syntax before privileged RPC');
const isUuid = new Function('return ' + idPattern)();
assert.equal(isUuid.test('00000000-0000-4000-8000-000000000001'), true);
for (const invalid of ['', 'not-a-uuid', '../../other', '00000000-0000-0000-0000-000000000001']) {
  assert.equal(isUuid.test(invalid), false, 'invalid request ID accepted: ' + invalid);
}
