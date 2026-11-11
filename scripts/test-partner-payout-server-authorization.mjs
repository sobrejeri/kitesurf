import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static server-action guardrails, complementary to isolated PostgreSQL RLS
// tests. These do NOT replace authenticated HTTP/E2E authorization tests.
const source = readFileSync('src/app/actions/partner-profile.ts', 'utf8');
const action = source.split('export async function savePartnerPayout(')[1]?.split('const AVATAR_MIMES')[0];
assert.ok(action, 'Payout server action must exist');
assert.match(action, /await requireRole\(\['partner'\]\)/, 'Payout requires an authenticated partner');
assert.match(action, /viewer\.role\s*!==\s*'partner'/, 'Payout rejects non-partners');
assert.match(action, /createSupabaseServerClient\(\)/, 'Payout must use the caller-scoped Supabase session');
assert.match(action, /\.select\('id'\)\.eq\('id',viewer\.id\)/, 'Existing payout lookup is scoped to caller');
assert.match(action, /\.update\(fields\)\.eq\('id',viewer\.id\)/, 'Update is scoped to caller');
assert.match(action, /\.insert\(\{id:viewer\.id,\.\.\.fields\}\)/, 'Insert binds id to caller');
assert.doesNotMatch(action, /service[_-]?role|createAdminClient|SUPABASE_SERVICE_ROLE_KEY/i,
  'Payout must not bypass RLS using a privileged client');
assert.doesNotMatch(action, /form\.get\(['"](?:id|userId|ownerId|partnerId)['"]\)/,
  'Payout owner must never come from form data');
assert.doesNotMatch(action, /(?:charge|refund|transfer|payoutNow|releaseFunds)\s*\(/i,
  'Saving payout details must not initiate financial operations');
console.log('PASS: partner payout server action remains caller-scoped and non-financial (static guardrails)');
