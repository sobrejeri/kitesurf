/**
 * Runtime regression guard for PostgREST PGRST201.
 *
 * Migration 27 created a second relationship from profiles to instructors
 * (assessed_by). Embedding profiles without specifying the original
 * instructors_id_fkey crashes the Admin and Instructor pages at runtime,
 * although TypeScript, Next build and PostgreSQL migration tests can pass.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync('src/lib/data.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20261102000027_student_kite_levels.sql', 'utf8',
);
assert.match(migration, /kite_assessed_by[\s\S]*?REFERENCES public\.instructors\(id\)/);
assert.match(source, /const BOOKING_COLUMNS\s*=\s*`[\s\S]*?instructor:instructors\s*\(\s*profile:profiles!instructors_id_fkey\s*\(/);
assert.match(source, /const INSTRUCTOR_COLUMNS\s*=\s*'[^']*profile:profiles!instructors_id_fkey\s*\(/);

const issues = [];
function walk(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const body = readFileSync(file, 'utf8');
      // A bare relationship is no longer unambiguous.
      if (/profile:profiles\s*\(/.test(body)) issues.push(file);
    }
  }
}
walk('src');
assert.deepEqual(issues, [], 'PostgREST ambiguous instructor profile embeds: ' + issues.join(', '));
console.log('PASS: instructor profile embeds specify original FK after Migration 27');
