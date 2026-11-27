// #93 etapa 3: visão do aluno para aula interrompida (textos da regra aprovada, flag desligada por padrão, sem saldo/reposição com a flag ligada).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interruptionCopy, interruptionFlowEnabled, isAwaitingResume } from '../src/lib/meeting-interruption.ts';

// flag: só "true" liga
assert.equal(interruptionFlowEnabled(undefined), false);
assert.equal(interruptionFlowEnabled('false'), false);
assert.equal(interruptionFlowEnabled('1'), false);
assert.equal(interruptionFlowEnabled('true'), true);

// textos: aviso fixo aprovado em 21/11, sem prometer crédito nem nova cobrança
const waiting = interruptionCopy('awaiting_resume', { plannedMinutes: 60, previousDone: 30, remaining: 30 });
assert.equal(waiting.title, 'Aula interrompida.');
assert.match(waiting.body, /Entre em contato com seu instrutor pelo chat para combinar a continuidade\./);
assert.match(waiting.body, /30 de 60 minutos/);
assert.match(waiting.body, /Não há nova cobrança/);
assert.equal(waiting.badge, 'Interrompida');
assert.equal(interruptionCopy('resume_scheduled', {}).badge, 'Continuidade agendada');
assert.match(interruptionCopy('resumed', {}).body, /uma única vez/);
assert.equal(interruptionCopy(null, {}), null);
assert.equal(interruptionCopy(undefined, {}), null);
for (const state of ['awaiting_resume', 'resume_scheduled', 'resumed']) {
  const copy = interruptionCopy(state, { plannedMinutes: 60, previousDone: 30 });
  assert.ok(!/reposição|saldo|crédito/i.test(`${copy.title} ${copy.body}`), `o aviso do aluno não fala em saldo/reposição (${state})`);
}
assert.equal(isAwaitingResume({ interruption_state: 'awaiting_resume' }), true);
assert.equal(isAwaitingResume({ interruption_state: 'resume_scheduled' }), false);
assert.equal(isAwaitingResume({}), false);

// a página do aluno: com a flag ligada não mostra o painel de saldo/reposição, não oferece remarcação do encontro interrompido
// nem o trata como "aguardando registro" ou "próximo encontro"
const page = readFileSync('src/app/aluno/(app)/reserva/[id]/page.tsx', 'utf8');
assert.ok(page.includes('interruptionFlow ? null : ('), 'o painel de saldo some com a flag ligada');
assert.ok(page.includes('!interruptionFlow && booking.status'), 'saldo legado zerado com a flag ligada');
assert.ok(page.includes("m.status==='scheduled' && !isAwaitingResume(m)"), 'encontro interrompido não é o próximo');
assert.ok(page.includes('!isAwaitingResume(meeting) ? ('), 'sem remarcação do encontro interrompido pelo aluno');
assert.ok(page.includes('!isAwaitingResume(m) && lessonNeedsInstructorRecord'), 'interrompido não é "aguardando registro"');
assert.ok(page.includes('/aluno/atendimento/${booking.id}'), 'o aviso leva ao chat da reserva');
const list = readFileSync('src/app/aluno/(app)/aulas/page.tsx', 'utf8');
assert.ok(list.includes('Interrompida · fale com o instrutor') && list.includes('!interrupted'), 'a lista de aulas distingue a aula interrompida');
const data = readFileSync('src/lib/data.ts', 'utf8');
assert.equal((data.match(/interruptionFlowEnabled\(\)/g) ?? []).length >= 3, true, 'leituras do aluno/instrutor/visualizador só pedem as colunas novas com a flag');
assert.ok(data.includes('Interruption columns unavailable'), 'sem as colunas no banco, volta à leitura de sempre');
console.log('Student interruption view checks passed.');
