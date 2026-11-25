#!/usr/bin/env node
/**
 * E2E autenticado do VentoKite (navegador real, Playwright) com CONTAS FICTÍCIAS. Gera PASS / FAIL / BLOQUEADO por cenário.
 * Não é rodado no CI (precisa de credenciais). Quem roda: pessoa com as contas de TESTE. Leia docs/E2E_AUTENTICADO.md.
 *
 * Segurança (fail-closed):
 *  - só roda contra hosts de E2E_ALLOWED_HOSTS (padrão: localhost e o app de teste); nunca contra o checkout real: o script não abre nenhuma tela de pagamento;
 *  - cenários que GRAVAM dados (salvar agenda, registrar folga) só com E2E_WRITE=sim, e usam só as contas informadas;
 *  - credenciais só por variável de ambiente; não são impressas nem gravadas. As capturas são salvas localmente: use contas fictícias.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { totp } from './totp.mjs';

const env = process.env;
const BASE = (env.E2E_BASE_URL ?? '').replace(/\/$/, '');
const OUT = env.E2E_OUT ?? 'e2e-out';
const WRITE = env.E2E_WRITE === 'sim';
const ALLOWED = (env.E2E_ALLOWED_HOSTS ?? 'localhost,127.0.0.1,vento-kitesurf.onrender.com').split(',').map((host) => host.trim()).filter(Boolean);
const results = [];
const record = (id, titulo, status, detalhe = '') => { results.push({ id, titulo, status, detalhe }); console.log(`${status.padEnd(9)} ${id} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`); };

if (!BASE) { console.error('Defina E2E_BASE_URL (ex.: http://localhost:3000).'); process.exit(2); }
const host = new URL(BASE).hostname;
if (!ALLOWED.includes(host)) { console.error(`Host ${host} fora de E2E_ALLOWED_HOSTS (${ALLOWED.join(', ')}). Recusado.`); process.exit(2); }

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { console.error('Playwright ausente. Instale: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

mkdirSync(OUT, { recursive: true });
const ACCOUNTS = {
  aluno: { path: '/aluno/entrar', email: env.E2E_STUDENT_EMAIL, password: env.E2E_STUDENT_PASSWORD, home: /\/aluno\// },
  instrutor: { path: '/instrutor/entrar', email: env.E2E_INSTRUCTOR_EMAIL, password: env.E2E_INSTRUCTOR_PASSWORD, home: /\/instrutor\// },
  afiliado: { path: '/afiliado/entrar', email: env.E2E_AFFILIATE_EMAIL, password: env.E2E_AFFILIATE_PASSWORD, home: /\/afiliado\// },
  admin: { path: '/admin/entrar', email: env.E2E_ADMIN_EMAIL, password: env.E2E_ADMIN_PASSWORD, home: /\/admin\//, totp: env.E2E_ADMIN_TOTP_SECRET },
};
const VIEWPORTS = { celular: { width: 390, height: 844 }, pc: { width: 1280, height: 900 } };

const browser = await chromium.launch();
const shot = async (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function login(area, viewport) {
  const account = ACCOUNTS[area];
  if (!account.email || !account.password) return { error: 'credenciais não informadas' };
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(BASE + account.path, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.endsWith('/entrar'), { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
  if (/\/verificacao/.test(page.url())) {
    if (!account.totp) { await context.close(); return { error: 'a conta pede o código do autenticador e E2E_ADMIN_TOTP_SECRET não foi informado' }; }
    await page.fill('input[name="code"]', totp(account.totp));
    await Promise.all([page.waitForURL((url) => !/\/verificacao/.test(url.pathname), { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
  }
  if (!account.home.test(new URL(page.url()).pathname) || /\/entrar|\/verificacao/.test(page.url())) {
    const message = await page.locator('[role="alert"], .text-danger, form p').first().innerText().catch(() => '');
    await context.close();
    return { error: `login não concluiu (${new URL(page.url()).pathname}${message ? `: ${message.slice(0, 80)}` : ''})` };
  }
  return { context, page };
}

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

// ---- S2 agenda do instrutor (#91) ---------------------------------------------------------------------------------------------
const instructor = sessions.instrutor;
if (!instructor) {
  record('S2', 'Agenda do instrutor (#91)', 'BLOQUEADO', 'sem sessão de instrutor');
} else {
  const { page } = instructor;
  await page.goto(BASE + '/instrutor/disponibilidade', { waitUntil: 'networkidle' });
  const hasWeekly = await page.locator('input[name="d1_opens"]').count();
  record('S2.1', 'Tela de turnos por dia aparece (versão v2)', hasWeekly === 1 ? 'PASS' : 'FAIL', hasWeekly ? '' : 'sem os campos por dia: a migration 20261125100000 está aplicada?');
  for (const [label, viewport] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(viewport);
    for (const view of ['day', 'week', 'month']) {
      await page.goto(`${BASE}/instrutor/agenda?visao=${view}`, { waitUntil: 'networkidle' });
      const extra = await overflow(page);
      await shot(page, `S2-agenda-${view}-${label}`);
      record(`S2.2.${view}.${label}`, `Agenda ${view} cabe na tela (${label})`, extra <= 0 ? 'PASS' : 'FAIL', `overflow-x=${extra}`);
    }
  }
  await page.setViewportSize(VIEWPORTS.celular);
  if (!WRITE) {
    record('S2.3', 'Salvar turnos com pausa e registrar folga', 'BLOQUEADO', 'grava dados: rode com E2E_WRITE=sim em conta de instrutor FICTÍCIA');
  } else if (!hasWeekly) {
    record('S2.3', 'Salvar turnos com pausa e registrar folga', 'BLOQUEADO', 'tela v2 ausente');
  } else {
    await page.goto(BASE + '/instrutor/disponibilidade', { waitUntil: 'networkidle' });
    for (let day = 0; day < 7; day += 1) {
      const box = page.locator(`input[name="d${day}"]`);
      if (day === 1 || day === 2) await box.check(); else await box.uncheck();
    }
    // Abre todas as pausas e zera as que a conta já tinha (uma pausa antiga fora do novo turno invalidaria o salvamento).
    await page.evaluate(() => document.querySelectorAll('details').forEach((node) => { node.open = true; }));
    for (let day = 0; day < 7; day += 1) for (let slot = 0; slot < 3; slot += 1) {
      await page.fill(`input[name="d${day}_b${slot}_from"]`, ''); await page.fill(`input[name="d${day}_b${slot}_to"]`, '');
    }
    await page.fill('input[name="d1_opens"]', '08:00'); await page.fill('input[name="d1_closes"]', '18:00');
    await page.fill('input[name="d2_opens"]', '14:00'); await page.fill('input[name="d2_closes"]', '20:00');
    await page.fill('input[name="d1_b0_from"]', '12:00'); await page.fill('input[name="d1_b0_to"]', '13:00');
    await page.click('button:has-text("Salvar minha disponibilidade")');
    const saved = await page.getByText('Disponibilidade salva').first().waitFor({ timeout: 20000 }).then(() => true, () => false);
    await shot(page, 'S2-turnos-salvos');
    record('S2.3', 'Salvar turnos (seg 08–18 com pausa 12–13; ter 14–20)', saved ? 'PASS' : 'FAIL');
    // pausa inválida é recusada com mensagem clara e sem alterar nada
    await page.fill('input[name="d1_b0_from"]', '07:00'); await page.fill('input[name="d1_b0_to"]', '09:00');
    await page.click('button:has-text("Salvar minha disponibilidade")');
    const refused = await page.getByText(/pausa precisa ficar dentro do turno/i).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
    record('S2.4', 'Pausa fora do turno é recusada com mensagem', refused ? 'PASS' : 'FAIL');
    // folga de 1 dia daqui a ~60 dias e remoção
    const target = new Date(Date.now() + 60 * 86400000 - 3 * 3600000).toISOString().slice(0, 10);
    await page.goto(BASE + '/instrutor/agenda?visao=month', { waitUntil: 'networkidle' });
    await page.getByText('Folga', { exact: true }).first().click();
    await page.fill('input[name="firstDay"]', target); await page.fill('input[name="lastDay"]', target);
    await page.click('button:has-text("Registrar folga")');
    const dayOff = await page.getByText('Folga registrada').first().waitFor({ timeout: 20000 }).then(() => true, () => false);
    record('S2.5', `Registrar folga em ${target}`, dayOff ? 'PASS' : 'FAIL');
    if (dayOff) {
      await page.goto(BASE + '/instrutor/agenda?visao=month', { waitUntil: 'networkidle' });
      await page.locator('li', { hasText: 'Folga · dias inteiros' }).last().getByRole('button', { name: 'Remover' }).click();
      const removed = await page.getByText('Bloqueio removido').first().waitFor({ timeout: 20000 }).then(() => true, () => false);
      record('S2.6', 'Remover a folga de teste', removed ? 'PASS' : 'FAIL');
    }
  }
}

// ---- Demais roteiros: manuais (ver docs) ------------------------------------------------------------------------------------------
record('M1', 'Reserva 2h e 4h pelo aluno, aceite e confirmação sem cobrança (#90)', 'BLOQUEADO', 'roteiro manual em docs/ROTEIRO_HOMOLOGACAO_FRENTES_89_93_103.md; o runner não automatiza a tela de reserva');
record('M2', 'Fila A→B→C com 3 instrutores (#92)', 'BLOQUEADO', 'depende de 3 instrutores aprovados e do agendador no projeto de teste');

for (const session of Object.values(sessions)) await session.context.close();
await browser.close();
const summary = { quando: new Date().toISOString(), base: BASE, gravou_dados: WRITE, total: results.length, PASS: results.filter((r) => r.status === 'PASS').length, FAIL: results.filter((r) => r.status === 'FAIL').length, BLOQUEADO: results.filter((r) => r.status === 'BLOQUEADO').length };
writeFileSync(join(OUT, 'resultado.json'), JSON.stringify({ summary, results }, null, 2));
writeFileSync(join(OUT, 'resultado.md'), `# E2E ${summary.quando}\n\nBase: ${BASE} · gravou dados: ${WRITE ? 'sim' : 'não'}\n\nPASS ${summary.PASS} · FAIL ${summary.FAIL} · BLOQUEADO ${summary.BLOQUEADO}\n\n| ID | Cenário | Resultado | Detalhe |\n|---|---|---|---|\n${results.map((r) => `| ${r.id} | ${r.titulo} | ${r.status} | ${r.detalhe.replace(/\|/g, '/')} |`).join('\n')}\n`);
console.log(`\nPASS ${summary.PASS} · FAIL ${summary.FAIL} · BLOQUEADO ${summary.BLOQUEADO} — relatório em ${OUT}/resultado.md`);
process.exit(summary.FAIL > 0 ? 1 : 0);
