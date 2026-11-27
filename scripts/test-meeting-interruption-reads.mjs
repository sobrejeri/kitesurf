// Behavioral coverage of #93 reads against legacy/extended mocked responses.
// This does not replace HTTP RLS or browser sessions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const env = {};
let schemaMissing = false;
let permissionDenied = false;
const reads = [];
const studentId = 'student-owner';
const instructorId = 'instructor-owner';
const bookingId = 'booking-owner';
const baseMeeting = { id: 'meeting-1', position: 1, starts_at: '2030-01-01T12:00:00Z',
  minutes: 120, status: 'scheduled', done_minutes: 0, note: null };
const extension = { planned_minutes: 120, previous_done_minutes: 30,
  remaining_minutes: 90, interruption_state: 'awaiting_resume', interruption_reason: 'Vento insuficiente', interruption_count: 1 };
const raw = { id: bookingId, code: 'VNT-QA', status: 'confirmed', is_test: true,
  student_id: studentId, instructor_id: instructorId, beach_id: 'beach-1', level: 'first_time',
  total_hours: 2, created_at: '2029-12-01T12:00:00Z', instructor: { profile: { full_name: 'Instrutor' } },
  beach: { name: 'Preá' }, student: { full_name: 'Aluno' } };
function query(table) {
  const read = { table, columns: '', filters: [] };
  const chain = {
    select(columns) { read.columns = columns; return this; },
    eq(key, value) { read.filters.push(['eq', key, value]); return this; },
    in(key, value) { read.filters.push(['in', key, value]); return this; },
    order() { return this; },
    returns() { return respond(false); },
    maybeSingle() { return respond(true); },
  };
  async function respond(single) {
    reads.push(structuredClone(read));
    if (permissionDenied && ['bookings', 'booking_meetings'].includes(table)) {
      return { data: null, error: { code: '42501', message: 'permission denied' } };
    }
    const extended = read.columns.includes('interruption_state');
    if (extended && schemaMissing) return { data: null, error: { code: '42703', message: 'column interruption_state does not exist' } };
    const meeting = { ...baseMeeting, ...(extended ? extension : {}) };
    if (table === 'bookings') {
      const data = read.columns.includes('booking_meetings') ? { ...raw, booking_meetings: [meeting] } : { ...raw };
      return { data: single ? data : [data], error: null };
    }
    if (table === 'booking_meetings') return { data: [{ ...meeting, booking_id: bookingId }], error: null };
    if (table === 'beaches') return { data: [{ id: 'beach-1', name: 'Preá' }], error: null };
    if (table === 'profiles') return { data: [{ id: instructorId, full_name: 'Instrutor' }], error: null };
    throw new Error('Unexpected read: ' + table);
  }
  return chain;
}
const db = { from: query, rpc() { throw new Error('Read path attempted a mutation/RPC'); } };
const compile = (path) => ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(path, deps) {
  const mod = { exports: {} };
  vm.runInNewContext(compile(path), { module: mod, exports: mod.exports, process: { env },
    console: { warn() {}, error() {} },
    require(id) { if (!(id in deps)) throw new Error('Unexpected dependency: ' + id); return deps[id]; },
  }, { filename: path });
  return mod.exports;
}
const lib = load('src/lib/meeting-interruption.ts', {});
const data = load('src/lib/data.ts', {
  'server-only': {},
  '@/lib/meeting-interruption': lib,
  './supabase/server': { async createSupabaseServerClient() { return db; } },
  './data-labels': { LEVEL_LABELS: {} },
});
async function exercise() {
  const student = await data.listBookingsForStudent(studentId);
  const instructor = await data.listBookingsForInstructor(instructorId);
  const viewer = await data.getBookingForViewer(bookingId, { id: studentId, role: 'student' });
  for (const row of [student[0], instructor[0], viewer]) {
    assert.equal(row.id, bookingId);
    assert.equal(row.booking_meetings[0].id, baseMeeting.id);
  }
  assert.ok(reads.some((r) => r.table === 'bookings' && r.filters.some((f) => f[1] === 'student_id' && f[2] === studentId)));
  assert.ok(reads.some((r) => r.table === 'bookings' && r.filters.some((f) => f[1] === 'instructor_id' && f[2] === instructorId)));
  assert.ok(reads.some((r) => r.table === 'booking_meetings' && r.filters.some((f) => f[1] === 'booking_id' && f[2][0] === bookingId)));
  return [student[0], instructor[0], viewer];
}
for (const flag of [undefined, 'false', '1', 'TRUE']) {
  reads.length = 0;
  if (flag === undefined) delete env.NEXT_PUBLIC_VENTO_INTERRUPTION_FLOW_ENABLED;
  else env.NEXT_PUBLIC_VENTO_INTERRUPTION_FLOW_ENABLED = flag;
  const result = await exercise();
  assert.ok(reads.every((r) => !r.columns.includes('interruption_') && !r.columns.includes('previous_done_minutes')),
    'flag off must never request columns missing from the deployed schema');
  assert.ok(result.every((r) => r.booking_meetings[0].interruption_state === undefined));
  assert.equal(await data.getBookingForViewer(bookingId, { id: 'other-student', role: 'student' }), null,
    'explicit owner check survives legacy path even if a response is incorrectly unscoped');
}
env.NEXT_PUBLIC_VENTO_INTERRUPTION_FLOW_ENABLED = 'true';
reads.length = 0;
let result = await exercise();
assert.ok(result.every((r) => r.booking_meetings[0].interruption_state === 'awaiting_resume'));
assert.equal(reads.filter((r) => r.columns.includes('interruption_state')).length, 3);
assert.equal(await data.getBookingForViewer(bookingId, { id: 'other-student', role: 'student' }), null,
  'extended path must retain explicit owner check');
assert.ok(await data.getBookingForViewer(bookingId, { id: 'admin-owner', role: 'admin' }));
schemaMissing = true;
reads.length = 0;
result = await exercise();
assert.ok(result.every((r) => r.booking_meetings[0].interruption_state === undefined));
assert.equal(reads.filter((r) => r.columns.includes('interruption_state')).length, 3);
assert.equal(await data.getBookingForViewer(bookingId, { id: 'other-student', role: 'student' }), null,
  'missing-column fallback must retain ownership enforcement');
schemaMissing = false;
permissionDenied = true;
for (const read of [
  () => data.listBookingsForStudent(studentId),
  () => data.listBookingsForInstructor(instructorId),
  () => data.getBookingForViewer(bookingId, { id: studentId, role: 'student' }),
]) await assert.rejects(read, 'permission errors cannot become successful reads');
console.log('PASS: interruption data reads keep legacy columns with flag off, extended state when available, scoped fallback and owner checks');
