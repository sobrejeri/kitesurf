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
// Regressões: a mensagem antiga, o instrutor ocupado e o erro desconhecido continuam como antes.
assert.match(friendlyError({ message: 'Student already has a lesson at the selected time' }), /aula ou uma busca/);
assert.match(friendlyError({ message: 'x', hint: 'NO_INSTRUCTOR' }), /Nenhum instrutor disponível/);
assert.match(friendlyError({ message: 'algo interno', code: 'XX000' }), /Não foi possível concluir agora/);
console.log('PASS: conflito de horário do aluno traduzido, sem código técnico');
