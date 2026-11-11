import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The production ledger contains only 39-42; instructing end users to run
// legacy migration 22 risks destructive, unreviewed baseline reapplication.
const source = readFileSync('src/app/actions/partner-profile.ts', 'utf8');
const message = source.match(/const MISSING_PROFILE\s*=\s*'([^']+)'/)?.[1];
assert.ok(message, 'Missing-schema message must exist');
assert.doesNotMatch(message, /(?:execute|aplique|rode|run).*migra(?:ç|c)[aã]o\s*\d+/i,
  'Do not instruct end users to execute an old migration');
assert.match(message, /equipe técnica/i, 'Missing schema must route to technical reconciliation');
console.log('PASS: affiliate missing-schema error does not prescribe legacy migrations');
