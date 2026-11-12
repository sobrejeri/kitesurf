import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('./instructor-queue-preflight.sql', import.meta.url), 'utf8');
const active = sql.split('\\n').filter(line => !line.trimStart().startsWith('--')).join('\\n');
assert.match(active, /to_regprocedure\\('public\\.advance_instructor_offer\\(uuid\\)'\\)/);
assert.match(active, /to_regclass\\('cron\\.job'\\)/);
for (const table of ['instructors', 'instructor_requests', 'instructor_offers']) {
  assert.match(active, new RegExp('FROM\\\\s+public\\\\.' + table + '\\\\b', 'i'));
}
assert.match(active, /expires_at\\s*<=\\s*now\\(\\)/i);
assert.match(active, /expires_at\\s+IS\\s+NULL/i);
assert.doesNotMatch(active, /\\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|CALL|DO|PERFORM|SELECT\\s+cron\\.schedule)\\b/i);
assert.doesNotMatch(active, /\\bFROM\\s+cron\\.job\\b/i);
assert.doesNotMatch(active, /\\bSELECT\\s+public\\.advance_instructor_offer\\s*\\(/i);
console.log('PASS: offline queue preflight is aggregate-only and read-only');
