import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('./instructor-queue-preflight.sql', import.meta.url), 'utf8');
const active = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
assert.match(active, /to_regprocedure\('public\.advance_instructor_offer\(uuid\)'\)/);
assert.match(active, /to_regclass\('cron\.job'\)/);
for (const table of ['instructors', 'instructor_requests', 'instructor_offers']) {
  assert.match(active, new RegExp('FROM\\s+public\\.' + table + '\\b', 'i'));
}
assert.match(active, /expires_at\s*<=\s*now\(\)/i);
assert.match(active, /expires_at\s+IS\s+NULL/i);
assert.doesNotMatch(active, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE|CALL|DO|PERFORM|SELECT\s+cron\.schedule)\b/i);
assert.doesNotMatch(active, /\bFROM\s+cron\.job\b/i);
assert.doesNotMatch(active, /\bSELECT\s+public\.advance_instructor_offer\s*\(/i);
console.log('PASS: offline queue preflight is aggregate-only and read-only');

const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(':memory:');
db.function('now', () => '2026-11-21T10:00:00Z');
db.exec(`
  ATTACH ':memory:' AS public;
  CREATE TABLE public.instructors (status text);
  CREATE TABLE public.instructor_requests (status text, expires_at text);
  CREATE TABLE public.instructor_offers (status text, expires_at text);
  INSERT INTO public.instructor_offers VALUES
    ('offered', '2026-11-21T10:00:00Z'),
    ('suggested', '2026-11-21T09:59:59Z'),
    ('suggested', '2026-11-21T10:01:00Z'),
    ('offered', NULL),
    ('accepted', '2026-11-20T10:00:00Z'),
    ('declined', NULL),
    ('expired', '2026-11-20T10:00:00Z');
`);
const [, countsQuery] = active.split(';');
const counts = db.prepare(countsQuery).get();
assert.deepEqual(
  [counts.pending_offers, counts.overdue_offers, counts.pending_offers_without_deadline],
  [4, 2, 1],
);
db.close();
console.log('PASS: outstanding offers include offered and suggested with their deadlines');
