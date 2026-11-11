import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isActive } from '../src/lib/navigation-state.ts';
import { modalFocusDestination } from '../src/lib/modal-focus.ts';

const lessons = { href: '/aluno/aulas', match: ['/aluno/reserva'] };
assert.equal(isActive('/aluno/aulas', lessons), true);
assert.equal(isActive('/aluno/aulas/registro', lessons), true);
assert.equal(isActive('/aluno/reserva/12345', lessons), true,
  'Booking detail should keep Minhas aulas selected');
assert.equal(isActive('/aluno/reservar', lessons), false,
  'Reserve form must not be mistaken for a booking detail');
assert.equal(isActive('/aluno/atendimento', lessons), false);
assert.equal(isActive('/aluno/conta/', { href: '/aluno/conta' }), true);
assert.equal(isActive('/aluno/contato', { href: '/aluno/conta' }), false);
assert.equal(isActive('/afiliado/perfil', { href: '/afiliado/inicio' }), false);
assert.equal(isActive('/afiliado/perfil', { href: '/afiliado/perfil' }), true);
assert.equal(isActive('/admin/reservas/42', { href: '/admin/reservas' }), true);

assert.equal(modalFocusDestination('backward', -1, 3, true), 2,
  'Shift+Tab from dialog panel must focus last control');
assert.equal(modalFocusDestination('backward', 0, 3), 2,
  'Shift+Tab from first wraps to last');
assert.equal(modalFocusDestination('forward', 2, 3), 0,
  'Tab from last wraps to first');
assert.equal(modalFocusDestination('forward', 0, 3), null,
  'Tab should move normally among interior controls');
assert.equal(modalFocusDestination('backward', 2, 3), null);
assert.equal(modalFocusDestination('forward', -1, 3, true), null,
  'Tab from dialog panel should naturally reach first control');
assert.equal(modalFocusDestination('forward', -1, 3, false), 0,
  'An outside focus target must be redirected inside the dialog');
assert.equal(modalFocusDestination('backward', -1, 0), -1,
  'An empty modal keeps focus on its dialog panel');

const mobile = readFileSync('src/components/mobile.tsx', 'utf8');
const shells = readFileSync('src/components/shells.tsx', 'utf8');
assert.match(mobile, /modalFocusDestination\(/,
  'Mobile dialog must apply tested focus trap');
assert.match(mobile, /aria-modal="true"/,
  'Mobile sheet must expose modal semantics');
assert.match(mobile, /event\.key === 'Escape'/,
  'Escape must still close the sheet');
assert.match(mobile, /!centerActive && !items\.some/,
  'More tab must not appear active when central action is selected');
assert.match(shells, /label:'Minhas aulas',icon:'calendar',match:\['\/aluno\/reserva'/,
  'Desktop Minhas aulas must own deep-linked booking details');
assert.match(shells, /const active = isActive\(pathname,item\)/,
  'Desktop sidebar must use the same route matcher as the phone');
console.log('PASS: precise active routes and dialog keyboard focus wrapping');
