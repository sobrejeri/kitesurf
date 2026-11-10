import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isActive } from '../src/lib/navigation-state.ts';

// Admin and Instructor workspace menus must use the same safe route matcher
// as the student and partner areas, never an unbounded string prefix.
const cases = [
  ['/admin/reservas', '/admin/reservas', true],
  ['/admin/reservas/booking-123', '/admin/reservas', true],
  ['/admin/reservas-relatorio', '/admin/reservas', false],
  ['/admin/avisos-externos', '/admin/avisos', false],
  ['/admin/avisos/123', '/admin/avisos', true],
  ['/instrutor/aula', '/instrutor/aula', true],
  ['/instrutor/aulas', '/instrutor/aula', false],
  ['/instrutor/agenda/semana', '/instrutor/agenda', true],
  ['/instrutor/agendamento', '/instrutor/agenda', false],
  ['/pousada/indicacoes/123', '/pousada/indicacoes', true],
  ['/pousada/indicacoes-externas', '/pousada/indicacoes', false],
  ['/aluno/reserva/booking-123', '/aluno/reserva', true],
  ['/aluno/reservar', '/aluno/reserva', false],
];
for (const [route, item, expected] of cases) {
  assert.equal(isActive(route, { href: item }), expected,
    `Incorrect route selection ${route} on ${item}`);
}

const shell = readFileSync('src/components/shells.tsx', 'utf8');
const workspace = shell.split('export function WorkspaceShell(')[1]
  ?.split('/** Tab labels have room')[0] ?? '';
assert.ok(workspace, 'WorkspaceShell definition must be present');
assert.match(workspace, /const current = nav\.find\(\(item\) => isActive\(pathname, item\)\)/,
  'Workspace header and breadcrumb must resolve a complete route');
assert.match(workspace, /const active = isActive\(pathname, item\)/,
  'Admin/Instructor desktop sidebar must use exact-or-child matching');
assert.doesNotMatch(workspace, /pathname\.startsWith\(item\.href\)/,
  'Workspace navigation must not match unrelated sibling route prefixes');
assert.match(workspace, /aria-current=\{active \? 'page' : undefined\}/,
  'Selected links must expose current-page semantics');

const ui = readFileSync('src/components/ui.tsx', 'utf8');
const badge = ui.split('export function Badge(')[1]?.split('export function Note(')[0] ?? '';
assert.ok(badge, 'Shared status badge must remain available');
assert.match(badge, /max-w-full/, 'Status badges must respect narrow card widths');
assert.match(badge, /break-words/, 'Long status labels must wrap instead of overflow');
assert.match(badge, /text-center/, 'Wrapped labels should stay centered');
assert.doesNotMatch(badge, /whitespace-nowrap/, 'Badges must not force overflow on narrow phones');
assert.match(badge, /\$\{tones\[tone\]\}/,
  'Status badges must preserve their existing theme-based color variants');
const buttons = ui.split('export function buttonClass(')[1]?.split('interface ButtonProps')[0] ?? '';
assert.match(buttons, /min-h-12/, 'Retain approved 48px mobile primary tap target');
assert.match(buttons, /min-h-10/, 'Retain existing compact control size');
console.log('PASS: Admin, Instructor, Partner and Student route matching; responsive badge and unchanged button sizing');
