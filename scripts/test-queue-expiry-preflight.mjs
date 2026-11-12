import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./queue-expiry-preflight.sql', import.meta.url), 'utf8');
const statements = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
assert.match(statements, /pg_extension[\\s\\S]*pg_cron/i);
assert.match(statements, /to_regclass\\('cron\\.job'\\)/i);
assert.match(statements, /to_regprocedure\\('public\\.advance_instructor_offer\\(uuid\\)'\\)/i);
assert.match(statements, /instructor_offers[\\s\\S]*status\\s*=\\s*'offered'[\\s\\S]*expires_at\\s*<\\s*now\\(\\)/i);
assert.match(statements, /instructor_requests[\\s\\S]*status\\s*=\\s*'searching'[\\s\\S]*expires_at\\s*<\\s*now\\(\\)/i);
assert.doesNotMatch(statements, /\\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|CALL|DO|PERFORM|cron\\.schedule)\\b/i);
assert.doesNotMatch(statements, /\\bFROM\\s+cron\\.job\\b/i);
console.log('PASS: queue expiry preflight is read-only, schema-aware and cron-safe');
