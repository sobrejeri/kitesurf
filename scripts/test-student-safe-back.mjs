import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { studentSafeBackHref } from '../src/lib/student-safe-back.ts';

const routes = new Map([
  ['/aluno/reservar', '/aluno/inicio'],
  ['/aluno/reservar/novo', '/aluno/inicio'],
  ['/aluno/reserva/1234', '/aluno/aulas'],
  ['/aluno/reserva/1234/detalhes', '/aluno/aulas'],
  ['/aluno/atendimento', '/aluno/aulas'],
  ['/aluno/atendimento/1234', '/aluno/aulas'],
  ['/aluno/ocorrencias', '/aluno/aulas'],
  ['/aluno/central', '/aluno/conta'],
  ['/aluno/avisos', '/aluno/conta'],
  ['/aluno/politicas', '/aluno/conta'],
]);
for (const [route, destination] of routes) {
  assert.equal(studentSafeBackHref(route), destination, `Bad back destination: ${route}`);
  assert.match(destination, /^\/aluno\//, `Cannot navigate outside student area: ${route}`);
}
const shell = readFileSync('src/components/shells.tsx', 'utf8');
assert.match(shell, /href=\{studentSafeBackHref\(pathname\)\}/, 'Student shell must use a safe internal link');
assert.doesNotMatch(shell, /history\.back\(\)/, 'A direct URL must not depend on external browser history');
console.log('PASS: safe internal back destinations for student deep links and installed PWA');
