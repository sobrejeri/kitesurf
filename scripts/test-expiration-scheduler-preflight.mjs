import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./expiration-scheduler-preflight.sql', import.meta.url), 'utf8');
const statements = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');

assert.match(statements, /pg_extension[\s\S]*pg_cron/i, 'Check pg_cron installation');
assert.match(statements, /to_regclass\('cron\.job'\)/i, 'Handle missing cron.job without querying it');
assert.match(statements, /to_regprocedure\('public\.expire_meeting_change_requests\(\)'\)/i);
assert.match(statements, /to_regprocedure\('public\.expire_balance_meeting_requests\(\)'\)/i);
for (const table of ['meeting_change_requests', 'balance_meeting_requests']) {
  assert.match(statements, new RegExp('FROM\\s+public\\.' + table + '\\b', 'i'));
}
assert.match(statements, /status\s*=\s*'pending'\s+AND\s+expires_at\s*<\s*now\(\)/i);
assert.match(statements, /expires_at\s+IS\s+NULL/i);
assert.doesNotMatch(statements, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|CALL|DO|PERFORM|SELECT\s+cron\.schedule)\b/i,
  'Preflight must remain read-only and never activate expiry jobs');
assert.doesNotMatch(statements, /\bFROM\s+cron\.job\b/i, 'Do not query missing cron.job');
console.log('PASS: expiry preflight is read-only and handles missing cron safely');
