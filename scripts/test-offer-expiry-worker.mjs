import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync('src/app/api/internal/expire-offers/route.ts', 'utf8');
for (const guard of [
  "VENTO_OFFER_WORKER_ENABLED !== 'true'",
  "VENTO_OFFER_WORKER_APPLY !== 'true'",
  "VENTO_OFFER_WORKER_SECRET",
  "timingSafeEqual",
  "SUPABASE_SERVICE_ROLE_KEY",
  ".slice(0, 10)",
  "advance_instructor_offer",
  "mode: 'preview'",
]) assert.ok(code.includes(guard), `missing safety guard: ${guard}`);
assert.ok(!code.includes("export async function GET"), 'runner must not expose GET mutation');
console.log('Offer expiry worker safety checks passed (static only; no live calls).');
