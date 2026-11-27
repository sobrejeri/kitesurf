// #91: regras puras da agenda do instrutor (turnos do formulário, grade de dia/semana/mês, folga/férias, fuso). Node 22.18+ lê .ts direto.
import assert from 'node:assert/strict';
import {
  addDays, daysCovered, groupByLocalDay, isDayKey, localDayKey, monthGrid, parseScheduleForm, shiftSummary,
  toRpcDays, viewRange, wholeDaysToRange, weekdayOf,
} from '../src/lib/instructor-agenda.ts';

const form = (fields) => (name) => fields[name] ?? null;

// turnos: valores diferentes por dia + pausa
let r = parseScheduleForm(form({ buffer: '30', d1: 'on', d1_opens: '08:00', d1_closes: '18:00', d1_b0_from: '12:00', d1_b0_to: '13:00', d2: 'on', d2_opens: '14:00', d2_closes: '20:00' }));
assert.ok(r.ok && r.days.length === 2 && r.buffer === 30);
assert.deepEqual(toRpcDays(r.days), [
  { weekday: 1, opens: '08:00', closes: '18:00', breaks: [{ from: '12:00', to: '13:00' }] },
  { weekday: 2, opens: '14:00', closes: '20:00' },
]);
assert.equal(shiftSummary(r.days[0]), '08:00–18:00 (pausa 12:00–13:00)');
assert.equal(shiftSummary(r.days[1]), '14:00–20:00');
// nenhum dia marcado = suspender novas reservas (válido)
r = parseScheduleForm(form({ buffer: '0' }));
assert.ok(r.ok && r.days.length === 0);
// recusas
const bad = (fields) => assert.equal(parseScheduleForm(form(fields)).ok, false, JSON.stringify(fields));
bad({ buffer: '121' }); bad({ buffer: '-1' }); bad({ buffer: '' }); bad({ buffer: '1.5' });
bad({ buffer: '0', d1: 'on', d1_opens: '18:00', d1_closes: '08:00' });
bad({ buffer: '0', d1: 'on', d1_opens: '08:00', d1_closes: '24:00' });
bad({ buffer: '0', d1: 'on', d1_opens: '08:00', d1_closes: '18:00', d1_b0_from: '07:00', d1_b0_to: '09:00' });
bad({ buffer: '0', d1: 'on', d1_opens: '08:00', d1_closes: '18:00', d1_b0_from: '12:00' });
bad({ buffer: '0', d1: 'on', d1_opens: '08:00', d1_closes: '18:00', d1_b0_from: '10:00', d1_b0_to: '12:00', d1_b1_from: '11:00', d1_b1_to: '13:00' });
// dia sem marcação ignora horários soltos
r = parseScheduleForm(form({ buffer: '0', d3_opens: '99:99' }));
assert.ok(r.ok && r.days.length === 0);

// calendário (novembro de 2026 começa num domingo)
assert.equal(weekdayOf('2026-11-01'), 0);
assert.equal(addDays('2026-11-30', 1), '2026-12-01');
for (const invalid of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-11-00', '', null, undefined]) {
  assert.equal(isDayKey(invalid), false);
}
assert.equal(wholeDaysToRange('2026-13-01', '2026-12-24'), null);
assert.equal(wholeDaysToRange('2026-12-24', '2026-00-01'), null);
assert.equal(isDayKey('2026-11-24'), true);
let v = viewRange('2026-11-24', 'day');
assert.deepEqual([v.first, v.last, v.previous, v.next], ['2026-11-24', '2026-11-25', '2026-11-23', '2026-11-25']);
assert.equal(v.startsAt, '2026-11-24T00:00:00-03:00');
v = viewRange('2026-11-24', 'week');
assert.deepEqual([v.first, v.last, v.previous, v.next], ['2026-11-22', '2026-11-29', '2026-11-17', '2026-12-01']);
v = viewRange('2026-11-24', 'month');
assert.deepEqual([v.first, v.last, v.previous, v.next], ['2026-11-01', '2026-12-01', '2026-10-01', '2026-12-01']);
v = viewRange('2026-01-31', 'month');
assert.equal(v.next, '2026-02-01');
assert.throws(() => viewRange('2026-13-01', 'day'));
let grid = monthGrid('2026-11-24');
assert.equal(grid.length, 5);
assert.ok(grid.every((week) => week.length === 7));
assert.equal(grid[0][0].key, '2026-11-01');
assert.equal(grid[4][6].key, '2026-12-05');
assert.equal(grid.flat().filter((cell) => cell.inMonth).length, 30);
grid = monthGrid('2026-10-10'); // outubro começa numa quinta
assert.equal(grid[0][0].key, '2026-09-27');
assert.equal(grid[0][0].inMonth, false);
assert.equal(grid.at(-1).at(-1).key, '2026-10-31');

// fuso: 02:30 UTC de 25/11 ainda é 23:30 de 24/11 em Fortaleza; 03:00 UTC já é 25/11 00:00
assert.equal(localDayKey('2026-11-25T02:30:00Z'), '2026-11-24');
assert.equal(localDayKey('2026-11-25T03:00:00Z'), '2026-11-25');
const groups = groupByLocalDay([{ at: '2026-11-25T02:30:00Z' }, { at: '2026-11-25T12:00:00Z' }, { at: '2026-11-24T15:00:00Z' }], (x) => x.at);
assert.deepEqual([...groups.keys()].sort(), ['2026-11-24', '2026-11-25']);
assert.equal(groups.get('2026-11-24').length, 2);

// folga e férias: dias inteiros em Fortaleza
assert.deepEqual(wholeDaysToRange('2026-12-24', '2026-12-26'), { start: '2026-12-24T00:00:00-03:00', end: '2026-12-27T00:00:00-03:00' });
assert.equal(wholeDaysToRange('2026-12-26', '2026-12-24'), null);
assert.equal(wholeDaysToRange('2026-12-24', 'x'), null);
assert.equal(new Date('2026-12-27T00:00:00-03:00').toISOString(), '2026-12-27T03:00:00.000Z');
assert.deepEqual(daysCovered('2026-12-24T03:00:00Z', '2026-12-27T03:00:00Z', '2026-12-01', '2027-01-01'), ['2026-12-24', '2026-12-25', '2026-12-26']);
assert.deepEqual(daysCovered('2026-12-24T03:00:00Z', '2026-12-27T03:00:00Z', '2026-12-25', '2026-12-26'), ['2026-12-25']);
assert.deepEqual(daysCovered('2026-12-24T13:00:00Z', '2026-12-24T15:00:00Z', '2026-12-01', '2027-01-01'), ['2026-12-24']);
console.log('Instructor agenda rules passed (form parsing, calendar grid, Fortaleza day mapping, whole-day ranges).');

// Guardas estáticas das Server Actions de agenda: papel de instrutor, entradas estritas, só RPCs de agenda, nenhum valor financeiro.
import { readFileSync } from 'node:fs';
const actions = readFileSync('src/app/actions/availability.ts', 'utf8');
const exported = [...actions.matchAll(/export async function (\w+)/g)].map((match) => match[1]);
assert.deepEqual(exported.sort(), ['addInstructorExtraHours', 'blockInstructorTime', 'removeInstructorExtraHours', 'saveInstructorSchedule', 'unblockInstructorTime']);
for (const name of exported) {
  const body = actions.slice(actions.indexOf(`export async function ${name}`)).split('\nexport async function ')[0];
  assert.ok(body.includes("await requireRole(['instructor'])"), `${name} precisa exigir o papel de instrutor`);
}
assert.ok(!/service_role|SUPABASE_SERVICE/i.test(actions), 'o app não usa a chave service_role');
assert.ok(!/price|cents|commission|total/i.test(actions.replace(/precision/g, '')), 'a agenda não recebe nem envia valores');
for (const rpc of ['save_my_weekly_schedule', 'add_my_time_off', 'unblock_my_time', 'add_my_extra_hours', 'remove_my_extra_hours']) {
  assert.ok(actions.includes(`rpc('${rpc}'`), `RPC ausente: ${rpc}`);
}
assert.ok(!actions.includes("rpc('block_my_time'") && !actions.includes("rpc('save_my_schedule'"), 'usar as RPCs v2 (com trava e reconciliação)');
assert.equal((actions.match(/z\.strictObject/g) ?? []).length, 3, 'schemas estritos para bloqueio, dias inteiros e horário extra (ids usam z.uuid)');
console.log('Instructor schedule Server Action guards passed.');
