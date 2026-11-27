// Funções puras do cenário prioritário do E2E (datas em Fortaleza, saldo esperado). O cenário em si não roda no CI.
import assert from 'node:assert/strict';
import { defaultMeetings, expectedBalance, fortalezaLocal, runPriorityScenario } from './e2e/cenario-4h.mjs';
import {createWriteEvidence} from './e2e/write-evidence.mjs';

assert.equal(fortalezaLocal(Date.parse('2026-11-26T02:30:00Z')), '2026-11-25T23:30');
assert.equal(fortalezaLocal(Date.parse('2026-11-26T03:00:00Z')), '2026-11-26T00:00');
// 1º encontro: agora + 2 h arredondado para cima em 30 min (hora de Fortaleza)
assert.equal(defaultMeetings(Date.parse('2026-11-25T16:10:00Z')).first, '2026-11-25T15:30'); // 13:10 local +2h = 15:10 -> 15:30
assert.equal(defaultMeetings(Date.parse('2026-11-25T16:30:00Z')).first, '2026-11-25T15:30'); // 13:30 +2h = 15:30
assert.equal(defaultMeetings(Date.parse('2026-11-26T01:10:00Z')).first, '2026-11-26T00:30'); // 22:10 local +2h = 00:10 do dia 26 -> 00:30

// 2º encontro: dois dias depois do 1º, às 09:00; sobrescrita por variável
assert.equal(defaultMeetings(Date.parse('2026-11-25T16:10:00Z')).second, '2026-11-27T09:00');
assert.equal(defaultMeetings(Date.parse('2026-11-25T16:10:00Z'), { E2E_M1: '2026-12-01T10:00', E2E_M2: '2026-12-05T08:00' }).first, '2026-12-01T10:00');
assert.equal(defaultMeetings(Date.parse('2026-11-25T16:10:00Z'), { E2E_M1: '2026-12-01T10:00' }).second, '2026-12-03T09:00');
// saldo: 4 h contratadas, 2 encontros de 2 h, 1º registrado com `done` minutos
assert.deepEqual(expectedBalance(120), { done: '2h', scheduled: '2h', available: '0min' });
assert.deepEqual(expectedBalance(110), { done: '1h 50min', scheduled: '2h', available: '10min' });
assert.deepEqual(expectedBalance(60), { done: '1h', scheduled: '2h', available: '1h' });
// Mesmo com duas sessões e as duas permissões de escrita, não tocar no navegador
// enquanto o runner não souber vincular oferta e encontros à reserva criada.
const results = [];
const forbiddenPage = new Proxy({}, { get() { throw new Error('navegador acessado antes da proteção'); } });
const evidence=createWriteEvidence();
await runPriorityScenario({
  sessions: { aluno: { page: forbiddenPage }, instrutor: { page: forbiddenPage } },
  BASE: 'https://example.invalid', WRITE: true, env: { E2E_CONFIRM_NO_CHARGE: 'sim' },
  resumeCheckpoint: forbiddenPage, checkpointStore:forbiddenPage,evidence,
  loadCheckpoint:()=>{throw Error('checkpoint lido antes da proteção');},
  record: (...args) => results.push(args), shot: () => { throw new Error('captura inesperada'); },
});
assert.equal(results.length, 9);
assert.ok(results.every((item) => item[2] === 'BLOQUEADO' && item[3].includes('identificação inequívoca')));
assert.equal(evidence.summary(true).gravou_dados,false,'all blocked with write flags must report no verified writes');
assert.equal(evidence.summary(true).tentativas_sem_confirmacao,0);
console.log('E2E scenario helpers passed (Fortaleza dates, expected balance).');
