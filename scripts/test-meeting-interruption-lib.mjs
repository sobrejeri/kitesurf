import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  checkMinutesAndSteps, fortalezaLocalInput, interruptionBadge, interruptionFlowEnabled, parseFortalezaLocal, parseStepSelections, remainingBounds,
} from '../src/lib/meeting-interruption.ts';
import { mayStartInstructorLesson } from '../src/lib/instructor-lesson-tabs.ts';

// Feature flag: só "true" liga. Padrão (sem variável) = desligada.
for (const v of [undefined, '', 'false', 'TRUE', '1', 'yes', ' true']) assert.equal(interruptionFlowEnabled(v), false, `flag deve ficar desligada para ${JSON.stringify(v)}`);
assert.equal(interruptionFlowEnabled('true'), true);
assert.equal(interruptionFlowEnabled(), process.env.NEXT_PUBLIC_VENTO_INTERRUPTION_FLOW_ENABLED === 'true');

// Restante: 1..(previsto - já ministrado). Interrompida 30/60 + retomada 30.
assert.deepEqual(remainingBounds(60, 0, 30), { min: 1, max: 30, canInterrupt: true });
assert.deepEqual(remainingBounds(60, 30, 20), { min: 1, max: 10, canInterrupt: true });   // 2ª interrupção
assert.deepEqual(remainingBounds(60, 0, 60), { min: 1, max: 0, canInterrupt: false }, 'nada sobrou: conclua normalmente');
assert.equal(remainingBounds(60, 40, 40).max, 0, 'nunca negativo');

// Etapas
const get = (o) => (n) => o[n];
const all = (v) => Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => ['step' + i, v]));
assert.deepEqual(parseStepSelections(get({ ...all('none'), step2: 'practiced', step3: 'mastered' })), { practiced: [2], mastered: [3] });
assert.ok('error' in parseStepSelections(get({ ...all('none'), step4: 'x' })), 'valor desconhecido recusado');
assert.ok('error' in parseStepSelections(get({ step1: 'none' })), 'faltando etapas recusado');
assert.equal(checkMinutesAndSteps(30, { practiced: [], mastered: [] }) !== null, true, 'minutos sem etapa');
assert.equal(checkMinutesAndSteps(0, { practiced: [1], mastered: [] }) !== null, true, 'etapa sem minutos');
assert.equal(checkMinutesAndSteps(0, { practiced: [], mastered: [] }), null);
assert.equal(checkMinutesAndSteps(45, { practiced: [1], mastered: [] }), null);

// Data de continuidade: America/Fortaleza (UTC-3), futuro, <= 90 dias, data inexistente recusada.
const now = Date.parse('2026-11-21T15:00:00Z');
assert.deepEqual(parseFortalezaLocal('2026-11-25T09:00', now), { iso: '2026-11-25T12:00:00.000Z' }, '09:00 em Fortaleza = 12:00 UTC');
for (const bad of [undefined, null, 5, '', '2026-11-25', '2026-11-25 09:00', '2026-11-25T09:00:00', '2026-02-30T09:00', '2026-13-01T09:00', '2026-11-21T11:00', '2026-11-20T09:00']) {
  assert.ok('error' in parseFortalezaLocal(bad, now), `deveria recusar ${JSON.stringify(bad)}`);
}
assert.ok('iso' in parseFortalezaLocal('2027-02-18T12:00', now), 'dentro de 90 dias');
assert.ok('error' in parseFortalezaLocal('2027-02-20T12:00', now), 'além de 90 dias');
// Datas impossíveis: usar relógios FIXOS anteriores à entrada para não confundir invalidez com passado.
const beforeFeb = Date.parse('2026-02-01T00:00:00Z');
for (const invalid of ['2026-02-30T09:00', '2026-04-31T09:00', '2027-02-29T09:00', '2026-11-25T24:00', '2026-11-25T25:00', '2026-11-25T09:60']) {
  assert.deepEqual(parseFortalezaLocal(invalid, beforeFeb), { error: 'Data inválida.' }, `data impossível recusada: ${invalid}`);
}
const beforeLeap = Date.parse('2028-02-01T00:00:00Z');
assert.deepEqual(parseFortalezaLocal('2028-02-29T09:00', beforeLeap), { iso: '2028-02-29T12:00:00.000Z' }, '29/02 bissexto válido');
assert.deepEqual(parseFortalezaLocal('2026-03-02T09:00', beforeFeb), { iso: '2026-03-02T12:00:00.000Z' }, 'data válida próxima à inválida aceita');
assert.equal(fortalezaLocalInput(Date.parse('2026-11-25T12:00:00Z')), '2026-11-25T09:00', 'ida e volta em Fortaleza');
assert.equal(fortalezaLocalInput(Date.parse('2026-11-25T02:30:00Z')), '2026-11-24T23:30', 'virada de dia em Fortaleza');

// Rótulos
assert.equal(interruptionBadge(null), null); assert.equal(interruptionBadge('awaiting_resume').tone, 'warning');

// Regra de início da tela = a do banco (24h) e interrompida sem continuidade nunca inicia.
const mk = (startsInMs, extra = {}) => ({ booking: { status: 'confirmed', booking_meetings: [{ position: 1, status: 'scheduled' }] }, meeting: { position: 1, status: 'scheduled', starts_at: new Date(now + startsInMs).toISOString(), ...extra } });
const day = (d) => new Date(d).toISOString().slice(0, 10);
assert.equal(mayStartInstructorLesson(mk(23 * 3600e3), '2026-11-21', day, now), true, 'a 23h inicia');
assert.equal(mayStartInstructorLesson(mk(25 * 3600e3), '2026-11-21', day, now), false, 'a 25h não inicia');
assert.equal(mayStartInstructorLesson(mk(-3600e3), '2026-11-21', day, now), true, 'início tardio');
assert.equal(mayStartInstructorLesson(mk(-3600e3, { interruption_state: 'awaiting_resume' }), '2026-11-21', day, now), false, 'interrompida sem continuidade não inicia');
assert.equal(mayStartInstructorLesson(mk(3600e3, { interruption_state: 'resume_scheduled' }), '2026-11-21', day, now), true, 'continuidade agendada inicia na janela');
assert.equal(mayStartInstructorLesson(mk(25 * 3600e3), '2026-11-21', () => '2026-11-21'), true, 'sem nowMs, regra antiga preservada (dia do calendário)');

// Regressão da tela: com a flag desligada o formulário e a leitura são os de antes (ver também o teste das actions).
const page = readFileSync('src/app/instrutor/(app)/aula/page.tsx', 'utf8');
assert.match(page, /const flowOn = interruptionFlowEnabled\(\)/, 'a tela decide pela flag');
assert.match(page, /flowOn && skills\.ready \? \(\s*<CompletionChoice/, 'nova escolha só com a flag ligada');
assert.match(page, /<ActionForm action=\{skills\.ready \? recordMeetingWithSkills : recordMeeting\}/, 'formulário legado preservado');
assert.doesNotMatch(page, /\.rpc\(/, 'a tela nunca chama RPC');
const data = readFileSync('src/lib/data.ts', 'utf8');
assert.match(data, /if \(interruptionFlowEnabled\(\) && BOOKING_COLUMNS\.includes\(MEETING_COLUMNS\)\)/, 'colunas novas só são lidas com a flag ligada');
for (const f of ['src/components/instructor/completion-choice.tsx', 'src/components/instructor/resume-scheduler.tsx']) {
  const c = readFileSync(f, 'utf8');
  assert.doesNotMatch(c, /\.rpc\(|createSupabase|service_role/, `${f} não acessa o banco`);
}
const envExample = readFileSync('.env.example', 'utf8');
assert.doesNotMatch(envExample, /INTERRUPTION_FLOW_ENABLED=true/, 'a flag não pode vir ligada no exemplo');
console.log('PASS: regras puras da interrupção (flag desligada por padrão, restante, etapas, data em Fortaleza, início em 24h) e regressão da tela');
// Achado da evidência visual: interrompida sem continuidade não pode mostrar o formulário de presença.
assert.match(page, /meeting\.interruption_state === 'awaiting_resume' \? \(\s*<Note title="Continuidade ainda não agendada">/, 'awaiting_resume mostra aviso e nunca o formulário de início');
