import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isActive } from '../src/lib/navigation-state.ts';
import { studentSafeBackHref } from '../src/lib/student-safe-back.ts';

// "Buscar instrutor" (/aluno/solicitacao/[id]) is where the student lands right
// after sending a lesson request, and where the "instrutor encontrado" notices
// point. Reproduced at iPhone and desktop width before this fix: no back arrow
// on the phone, no selected tab on the phone and no selected sidebar item on
// the PC, while the page's own desktop header already returns to Minhas aulas.
const REQUEST = '/aluno/solicitacao/7f0c1d2e-3a4b-4c5d-8e9f-001122334455';

assert.equal(studentSafeBackHref(REQUEST), '/aluno/aulas',
  'The phone back arrow must return to Minhas aulas, like the desktop header');

const shell = readFileSync('src/components/shells.tsx', 'utf8');
const routesIn = (pattern, what) => {
  const found = shell.match(pattern);
  assert.ok(found, `${what} not found in StudentShell`);
  return [...found[1].matchAll(/'([^']+)'/g)].map((route) => route[1]);
};

const subpages = routesIn(/const STUDENT_SUBPAGES = \[([^\]]*)\]/, 'STUDENT_SUBPAGES');
assert.ok(subpages.some((route) => REQUEST === route || REQUEST.startsWith(`${route}/`)),
  'The phone app bar must show the back arrow on the request page');

const phoneTab = {
  href: '/aluno/aulas',
  match: routesIn(/label: 'Minhas aulas', href: '\/aluno\/aulas', icon: 'book', match: \[([^\]]*)\]/, 'Phone Minhas aulas tab'),
};
assert.equal(isActive(REQUEST, phoneTab), true, 'The phone tab bar must keep Minhas aulas selected');
assert.equal(isActive('/aluno/solicitacoes', phoneTab), false, 'A sibling prefix must not select Minhas aulas');

const desktopLink = {
  href: '/aluno/aulas',
  match: routesIn(/href:'\/aluno\/aulas',label:'Minhas aulas',icon:'calendar',match:\[([^\]]*)\]/, 'Desktop Minhas aulas link'),
};
assert.equal(isActive(REQUEST, desktopLink), true, 'The desktop sidebar must keep Minhas aulas selected');
assert.equal(isActive('/aluno/reserva/1234', desktopLink), true, 'Booking details keep their existing selection');
assert.equal(isActive('/aluno/reservar', desktopLink), false, 'The booking form is not a lesson detail');

const page = readFileSync('src/app/aluno/(app)/solicitacao/[id]/page.tsx', 'utf8');
assert.match(page, /backHref="\/aluno\/aulas"/, 'Desktop and phone must agree on the back destination');

console.log('PASS: request page keeps Minhas aulas selected and has a safe back arrow on phone and PC');
