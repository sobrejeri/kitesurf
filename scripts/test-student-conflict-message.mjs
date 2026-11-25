// P0 #90: o conflito de horário do próprio aluno (gatilho da PR #298, SQLSTATE 23P01 / 55000) chega ao aluno em português,
// nunca como "código 23P01". Importa o arquivo real, sem mocks.
import assert from 'node:assert/strict';
import { friendlyError } from '../src/app/actions/errors.ts';

const MSG = /outro encontro nesse horário/;
for (const error of [
  { message: 'Student already has a meeting in this time slot', code: '23P01', hint: 'STUDENT_MEETING_CONFLICT' },
  { message: 'Student already has a meeting in this time slot', code: '55000', hint: 'STUDENT_MEETING_CONFLICT' },
  { message: '', code: '23P01', hint: 'STUDENT_MEETING_CONFLICT' }, // só o hint
]) {
  const text = friendlyError(error);
  assert.match(text, MSG, `mensagem amigável esperada para ${JSON.stringify(error)}, veio: ${text}`);
  assert.doesNotMatch(text, /23P01|55000|código/i, 'o código técnico não deve aparecer');
}
// Concorrência (deadlock 40P01, "tente de novo" 40001): mensagem clara, sem o código técnico.
for (const error of [{ message: 'deadlock detected', code: '40P01' }, { message: 'Booking changed, try again', code: '40001' }, { message: '', code: '40P01' }]) {
  const text = friendlyError(error);
  assert.match(text, /tente de novo/i, `mensagem de concorrência esperada para ${JSON.stringify(error)}, veio: ${text}`);
  assert.doesNotMatch(text, /40P01|40001|código/i, 'o código técnico não deve aparecer');
}
// Regressões: a mensagem antiga, o instrutor ocupado e o erro desconhecido continuam como antes.
assert.match(friendlyError({ message: 'Student already has a lesson at the selected time' }), /aula ou uma busca/);
assert.match(friendlyError({ message: 'x', hint: 'NO_INSTRUCTOR' }), /Nenhum instrutor disponível/);
assert.match(friendlyError({ message: 'algo interno', code: 'XX000' }), /Não foi possível concluir agora/);
console.log('PASS: conflito de horário do aluno traduzido, sem código técnico');

// #90: rejection from the canonical database guard must match the UI/server rule.
assert.equal(friendlyError({ message: 'Only one meeting per local calendar day is allowed', code: '22023' }),
  'Escolha apenas um encontro por dia. Distribua as horas em datas diferentes.');
assert.match(friendlyError({ message: 'Overlapping meetings', code: '22023' }), /mesmo horário/);
console.log('PASS: duplicate civil-day rejection translated without exposing SQLSTATE');
