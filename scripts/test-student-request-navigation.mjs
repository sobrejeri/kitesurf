import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isActive } from '../src/lib/navigation-state.ts';
import { studentSafeBackHref } from '../src/lib/student-safe-back.ts';

const REQUEST = '/aluno/solicitacao/7f0c1d2e-3a4b-4c5d-8e9f-001122334455';
assert.equal(studentSafeBackHref(REQUEST), '/aluno/aulas');
const shell = readFileSync('src/components/shells.tsx', 'utf8');
const routesIn = (pattern, name) => {
  const match = shell.match(pattern);
  assert.ok(match, name + ' missing');
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
};
const subpages = routesIn(/const STUDENT_SUBPAGES = \[([^\]]*)\]/, 'subpages');
assert.ok(subpages.some((route) => REQUEST === route || REQUEST.startsWith(route + '/')));
const phone = { href: '/aluno/aulas', match: routesIn(/label: 'Minhas aulas', href: '\/aluno\/aulas', icon: 'book', match: \[([^\]]*)\]/, 'phone tab') };
assert.equal(isActive(REQUEST, phone), true);
assert.equal(isActive('/aluno/solicitacoes', phone), false);
const desktop = { href: '/aluno/aulas', match: routesIn(/href:'\/aluno\/aulas',label:'Minhas aulas',icon:'calendar',match:\[([^\]]*)\]/, 'desktop link') };
assert.equal(isActive(REQUEST, desktop), true);
assert.equal(isActive('/aluno/reserva/1234', desktop), true);
assert.equal(isActive('/aluno/reservar', desktop), false);
const page = readFileSync('src/app/aluno/(app)/solicitacao/[id]/page.tsx', 'utf8');
assert.match(page, /backHref="\/aluno\/aulas"/);
console.log('PASS: request page safe back and active navigation');
