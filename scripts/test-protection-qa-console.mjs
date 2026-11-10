import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const path = 'src/app/admin/(app)/protege-homologacao/page.tsx';
const page = readFileSync(path, 'utf8');
const navigation = readFileSync('src/app/admin/(app)/central/page.tsx', 'utf8');
const flag = readFileSync('src/lib/protection-stage3.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20261110000041_vento_protege_block_mutation_rpcs.sql', 'utf8');
assert.match(page, /await requireRole\(\['admin'\]/, 'QA console must require Admin');
assert.match(page, /createSupabaseServerClient\('admin'\)/, 'QA must use RLS user session');
assert.match(page, /count: 'exact', head: true/, 'QA must use minimal count-only queries');
assert.match(page, /databaseReadable/, 'Real query errors must not look like empty results');
assert.match(page, /protectionStage3Enabled\(\)/, 'Release flag status must be represented');
assert.match(page, /do not|não/i, 'Warnings must be presented');
assert.doesNotMatch(page, /\.rpc\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.upload\(|\.remove\(|createSignedUrl|service_role|SUPABASE_SERVICE_ROLE/i,
  'Admin diagnostic must never mutate protected cases or use privileged access');
assert.match(navigation, /href: '\/admin\/protege-homologacao'/, 'Admin navigation entry missing');
assert.match(flag, /NEXT_PUBLIC_VENTO_PROTEGE_STATEMENTS_ENABLED/, 'Feature flag must remain explicit');
assert.match(migration, /REVOKE EXECUTE ON FUNCTION/, 'Backend release lock must remain present');
assert.doesNotMatch(migration, /GRANT EXECUTE TO authenticated/, 'QA console must not unlock Stage3 RPCs');
console.log('PASS: read-only Admin QA console, release lock and navigation invariant');
