import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const requireNode = createRequire(import.meta.url);
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const M = '11111111-1111-4111-8111-111111111111';
const calls = [];
let role = 'instructor';
let rpcError = null;
const db = { async rpc(name, args) { calls.push({ name, args }); return { error: rpcError }; } };
const env = {};
const sandbox = (code, name, deps) => {
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, process: { env },
    require(id) { if (!(id in deps)) throw new Error('Unexpected import: ' + id); return deps[id]; },
    console: { error() {}, warn() {} },
  }, { filename: name });
  return mod.exports;
};
const lib = sandbox(compile('../src/lib/meeting-interruption.ts'), 'lib.cjs', {});
const { friendlyError } = sandbox(compile('../src/app/actions/errors.ts'), 'errors.cjs', {});
const actions = sandbox(compile('../src/app/actions/meeting-interruption.ts'), 'actions.cjs', {
  'next/cache': { revalidatePath() {} },
  zod: requireNode('zod'),
  '@/lib/auth': { async requireRole(roles) { if (!roles.includes(role)) throw new Error('Unauthorized role'); return { id: 'i', role }; } },
  '@/lib/supabase/server': { async createSupabaseServerClient() { return db; } },
  '@/lib/meeting-interruption': lib,
  './errors': { friendlyError },
});
const { completeMeeting, interruptMeeting, scheduleMeetingResume } = actions;
const form = (fields) => { const v = new Map(Object.entries(fields)); return { get: (n) => (v.has(n) ? v.get(n) : null) }; };
const steps = (over = {}) => Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => ['step' + i, over['step' + i] ?? 'none']));
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const reset = () => { calls.length = 0; rpcError = null; };

// 1. Flag DESLIGADA (padrão): nenhuma action chega ao banco.
for (const [fn, f] of [[completeMeeting, { meetingId: M, doneMinutes: '45', ...steps({ step1: 'practiced' }) }],
  [interruptMeeting, { meetingId: M, reason: 'Vento forte demais', doneMinutes: '30', remainingMinutes: '30', ...steps({ step1: 'practiced' }) }],
  [scheduleMeetingResume, { meetingId: M, startsAt: '2099-01-01T09:00' }]]) {
  const r = await fn({}, form(f));
  assert.match(r.error, /ainda não foi liberado/, 'com a flag desligada a ação é recusada');
}
assert.equal(calls.length, 0, 'flag desligada: zero chamadas ao banco');

// 2. Permissão: só instrutor (a checagem acontece antes de qualquer outra coisa).
env.NEXT_PUBLIC_VENTO_INTERRUPTION_FLOW_ENABLED = 'true';
for (const r of ['student', 'admin', 'partner']) {
  role = r;
  for (const fn of [completeMeeting, interruptMeeting, scheduleMeetingResume]) await assert.rejects(() => fn({}, form({})), /Unauthorized role/);
}
role = 'instructor'; assert.equal(calls.length, 0);

// 3. Concluir normalmente (ex.: 45/60): só a RPC nova, com argumentos fixos; nunca valor, aluno ou instrutor do cliente.
reset();
let r = await completeMeeting({}, form({ meetingId: M, doneMinutes: '45', ...steps({ step1: 'practiced', step2: 'mastered' }), studentId: 'x', instructorId: 'y', priceCents: '1' }));
assert.ok(r.ok, r.error);
same(calls.at(-1), { name: 'complete_meeting_with_skills', args: { p_meeting_id: M, p_done_minutes: 45, p_practiced_steps: [1], p_mastered_steps: [2] } });
reset();
for (const doneMinutes of ['', null, '1e2', '-1', '481', '0120', '4.5', ' 45', 'abc']) {
  r = await completeMeeting({}, form({ meetingId: M, doneMinutes, ...steps({ step1: 'practiced' }) })); assert.ok(r.error, `minutos ${doneMinutes}`);
}
r = await completeMeeting({}, form({ meetingId: 'nao-e-uuid', doneMinutes: '45', ...steps({ step1: 'practiced' }) })); assert.ok(r.error);
r = await completeMeeting({}, form({ meetingId: M, doneMinutes: '45', ...steps() })); assert.match(r.error, /pelo menos uma etapa/);
r = await completeMeeting({}, form({ meetingId: M, doneMinutes: '0', ...steps({ step1: 'practiced' }) })); assert.match(r.error, /zero minutos/);
r = await completeMeeting({}, form({ meetingId: M, doneMinutes: '45', ...steps({ step3: 'xyz' }) })); assert.match(r.error, /evolução de cada etapa/);
assert.equal(calls.length, 0, 'entradas inválidas nunca chegam ao banco');
r = await completeMeeting({}, form({ meetingId: M, doneMinutes: '0', ...steps() })); assert.ok(r.ok, '0 minuto sem etapas é válido (aula que não aconteceu)');

// 4. Interromper 30/60: motivo aparado, restante positivo, etapas coerentes.
reset();
r = await interruptMeeting({}, form({ meetingId: M, reason: '  Vento forte demais para voar  ', doneMinutes: '30', remainingMinutes: '30', ...steps({ step1: 'practiced' }), studentId: 'x' }));
assert.ok(r.ok, r.error);
same(calls.at(-1), { name: 'interrupt_meeting', args: { p_meeting_id: M, p_reason: 'Vento forte demais para voar', p_done_minutes: 30, p_remaining_minutes: 30, p_practiced_steps: [1], p_mastered_steps: [] } });
reset();
for (const bad of [{ reason: 'curto' }, { reason: 'x'.repeat(501) }, { reason: '        ' }, { remainingMinutes: '0' }, { remainingMinutes: '' }, { remainingMinutes: '1e2' },
  { remainingMinutes: '-5' }, { doneMinutes: '-1' }, { doneMinutes: '9999' }]) {
  r = await interruptMeeting({}, form({ meetingId: M, reason: 'Vento forte demais', doneMinutes: '30', remainingMinutes: '30', ...steps({ step1: 'practiced' }), ...bad }));
  assert.ok(r.error, `deveria recusar ${JSON.stringify(bad)}`);
}
r = await interruptMeeting({}, form({ meetingId: M, reason: 'Vento forte demais', doneMinutes: '30', remainingMinutes: '30', ...steps() })); assert.match(r.error, /pelo menos uma etapa/);
assert.equal(calls.length, 0);

// 5. Agendar a continuidade: horário de Fortaleza -> UTC; passado, formato e >90 dias nunca chegam ao banco.
reset();
const future = new Date(Date.now() + 5 * 86_400_000);
const local = lib.fortalezaLocalInput(future.getTime());
r = await scheduleMeetingResume({}, form({ meetingId: M, startsAt: local, studentId: 'x' }));
assert.ok(r.ok, r.error);
assert.equal(calls.at(-1).name, 'schedule_meeting_resume');
same(Object.keys(calls.at(-1).args).sort(), ['p_meeting_id', 'p_starts_at']);
assert.equal(calls.at(-1).args.p_starts_at, new Date(Date.parse(`${local}:00-03:00`)).toISOString());
reset();
for (const startsAt of ['', null, '2020-01-01T09:00', '2026-02-30T09:00', 'amanhã', lib.fortalezaLocalInput(Date.now() + 120 * 86_400_000)]) {
  r = await scheduleMeetingResume({}, form({ meetingId: M, startsAt })); assert.ok(r.error, `data ${startsAt}`);
}
assert.equal(calls.length, 0);

// 6. Erros do banco viram frases claras; RPC ausente falha fechado.
for (const [message, expected] of [
  ['Instructor unavailable for proposed meeting', /agenda do instrutor/], ['Continuation time changes booking order', /ordem dos encontros/],
  ['Only a meeting in progress can be interrupted', /em andamento/], ['Remaining minutes must be between 1 and 30', /tempo restante/],
  ['Schedule the continuation of the interrupted meeting first', /Agende a continuidade/], ['Meeting not found', /./]]) {
  rpcError = { code: '55000', message }; reset(); rpcError = { code: '55000', message };
  r = await scheduleMeetingResume({}, form({ meetingId: M, startsAt: local })); assert.match(r.error, expected, message);
}
rpcError = { code: '55000', message: 'Student already has a meeting in this time slot' };
r = await scheduleMeetingResume({}, form({ meetingId: M, startsAt: local })); assert.match(r.error, /O aluno já tem outro encontro/, 'mensagem para o instrutor, não para o aluno');
for (const fn of [() => completeMeeting({}, form({ meetingId: M, doneMinutes: '45', ...steps({ step1: 'practiced' }) })),
  () => interruptMeeting({}, form({ meetingId: M, reason: 'Vento forte demais', doneMinutes: '30', remainingMinutes: '30', ...steps({ step1: 'practiced' }) })),
  () => scheduleMeetingResume({}, form({ meetingId: M, startsAt: local }))]) {
  rpcError = { code: 'PGRST202', message: 'function not found' };
  r = await fn(); assert.match(r.error, /ainda não está disponível no banco/, 'migration ausente: falha fechado, sem cair no legado');
}

// 7. Sem leitura/escrita direta de tabela e sem fallback para RPC legada.
const src = readFileSync('src/app/actions/meeting-interruption.ts', 'utf8');
assert.doesNotMatch(src, /\.from\(|record_meeting|start_meeting|request_balance|service_role|SUPABASE_SECRET/, 'só as 3 RPCs novas');
assert.equal((src.match(/requireRole\(\['instructor'\]\)/g) ?? []).length, 3, 'as 3 actions exigem instrutor');
assert.equal((src.match(/interruptionFlowEnabled\(\)\) return NOT_ENABLED/g) ?? []).length, 3, 'as 3 actions respeitam a flag');
console.log('PASS: Server Actions da interrupção: flag desligada recusa, só instrutor, validação, argumentos fixos, erros claros e falha fechada sem a migration');
