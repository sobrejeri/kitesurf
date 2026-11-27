#!/usr/bin/env node
/**
 * E2E autenticado do VentoKite (navegador real, Playwright) com CONTAS FICTÍCIAS. Gera PASS / FAIL / BLOQUEADO por cenário.
 * Não é rodado no CI (precisa de credenciais). Quem roda: pessoa com as contas de TESTE. Leia docs/E2E_AUTENTICADO.md.
 *
 * Segurança (fail-closed):
 *  - só roda contra hosts de E2E_ALLOWED_HOSTS (padrão: localhost e o app de teste); nunca contra o checkout real: o script não abre nenhuma tela de pagamento;
 *  - cenários que GRAVAM dados (reserva de teste, aceite, registro de aula) só com E2E_WRITE=sim E E2E_CONFIRM_NO_CHARGE=sim, e usam só as contas informadas;
 *  - credenciais só por variável de ambiente; não são impressas nem gravadas. As capturas são salvas localmente: use contas fictícias.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCOUNTS, BASE, OUT, VIEWPORTS, WRITE, browser, login, overflow, record, results, shot } from './common.mjs';
import { runPriorityScenario } from './cenario-4h.mjs';
import { createCheckpointStore } from './checkpoint-store.mjs';
import { createWriteEvidence } from './write-evidence.mjs';

const checkpointStore=createCheckpointStore({path:process.env.E2E_RESUME_CHECKPOINT ?? join(OUT,'priority-checkpoint.json')});
const evidence=createWriteEvidence();

// ---- S0 público: as quatro telas de entrada abrem e cabem na tela ------------------------------------------------------
for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  for (const [area, account] of Object.entries(ACCOUNTS)) {
    const response = await page.goto(BASE + account.path, { waitUntil: 'networkidle' }).catch(() => null);
    const extra = await overflow(page).catch(() => -1);
    const hasForm = await page.locator('input[name="email"]').count();
    await shot(page, `S0-entrar-${area}-${label}`);
    record(`S0.${area}.${label}`, `Tela de entrada do ${area} abre e cabe (${label})`, response?.ok() && hasForm === 1 && extra <= 0 ? 'PASS' : 'FAIL', `http=${response?.status()} form=${hasForm} overflow-x=${extra}`);
  }
  await context.close();
}

// ---- S1 login por perfil ---------------------------------------------------------------------------------------------------
const sessions = {};
for (const area of Object.keys(ACCOUNTS)) {
  const result = await login(area, VIEWPORTS.celular);
  if (result.error) { record(`S1.${area}`, `Login do ${area}`, 'BLOQUEADO', result.error); continue; }
  sessions[area] = result;
  await shot(result.page, `S1-home-${area}`);
  record(`S1.${area}`, `Login do ${area} chega à própria área`, 'PASS', new URL(result.page.url()).pathname);
}

// ---- S1b isolamento: um perfil não abre a área dos outros -----------------------------------------------------------------
for (const [area, session] of Object.entries(sessions)) {
  const others = Object.keys(ACCOUNTS).filter((other) => other !== area);
  const leaks = [];
  for (const other of others) {
    await session.page.goto(`${BASE}/${other}/${other === 'aluno' ? 'aulas' : other === 'instrutor' ? 'hoje' : other === 'afiliado' ? 'inicio' : 'visao'}`, { waitUntil: 'networkidle' }).catch(() => {});
    const path = new URL(session.page.url()).pathname;
    const body = await session.page.locator('body').innerText().catch(() => '');
    // Cada app tem o próprio cookie de sessão: sem login naquela área, cai na tela de entrada.
    if (!/\/entrar|\/verificacao/.test(path) && !/conta de|Entre pelo app/i.test(body)) leaks.push(`${other}:${path}`);
  }
  record(`S1b.${area}`, `${area} não acessa as outras áreas`, leaks.length === 0 ? 'PASS' : 'FAIL', leaks.join(', '));
}

// ---- P: cenário prioritário (4 h em 2 encontros, aceite, presença, minutos e competências, evolução e saldo) ------------------
await runPriorityScenario({
  sessions,browser,BASE,WRITE,env:process.env,record,shot,
  resumeCheckpoint:process.env.E2E_RESUME_CHECKPOINT ? checkpointStore.load(BASE) : null,
  checkpointStore,evidence,
});

// ---- Demais roteiros: manuais (ver docs) ------------------------------------------------------------------------------------------
record('M2', 'Fila A→B→C com 3 instrutores (#92)', 'BLOQUEADO', 'depende de 3 instrutores aprovados e do agendador no projeto de teste');

for (const session of Object.values(sessions)) await session.context.close();
await browser.close();
const summary = { quando: new Date().toISOString(), base: BASE, ...evidence.summary(WRITE && process.env.E2E_CONFIRM_NO_CHARGE==='sim'), total: results.length, PASS: results.filter((r) => r.status === 'PASS').length, FAIL: results.filter((r) => r.status === 'FAIL').length, BLOQUEADO: results.filter((r) => r.status === 'BLOQUEADO').length };
writeFileSync(join(OUT, 'resultado.json'), JSON.stringify({ summary, results }, null, 2));
writeFileSync(join(OUT, 'resultado.md'), `# E2E ${summary.quando}\n\nBase: ${BASE} · gravação comprovada: ${summary.gravou_dados ? 'sim' : 'não'} · tentativas sem confirmação: ${summary.tentativas_sem_confirmacao}\n\nSem comprovação não significa que uma resposta perdida não tenha gravado.\n\nPASS ${summary.PASS} · FAIL ${summary.FAIL} · BLOQUEADO ${summary.BLOQUEADO}\n\n| ID | Cenário | Resultado | Detalhe |\n|---|---|---|---|\n${results.map((r) => `| ${r.id} | ${r.titulo} | ${r.status} | ${r.detalhe.replace(/\|/g, '/')} |`).join('\n')}\n`);
console.log(`\nPASS ${summary.PASS} · FAIL ${summary.FAIL} · BLOQUEADO ${summary.BLOQUEADO} — relatório em ${OUT}/resultado.md`);
process.exit(summary.FAIL > 0 ? 1 : 0);
