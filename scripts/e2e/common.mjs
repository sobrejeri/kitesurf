/** Configuração, segurança e login compartilhados pelos scripts de E2E (run.mjs) e de varredura de telas (crawl.mjs). */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { totp } from './totp.mjs';

const env = process.env;
export const BASE = (env.E2E_BASE_URL ?? '').replace(/\/$/, '');
export const OUT = env.E2E_OUT ?? 'e2e-out';
export const WRITE = env.E2E_WRITE === 'sim';
export const ALLOWED = (env.E2E_ALLOWED_HOSTS ?? 'localhost,127.0.0.1,vento-kitesurf.onrender.com').split(',').map((host) => host.trim()).filter(Boolean);
export const results = [];
export const record = (id, titulo, status, detalhe = '') => { results.push({ id, titulo, status, detalhe }); console.log(`${status.padEnd(9)} ${id} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`); };

if (!BASE) { console.error('Defina E2E_BASE_URL (ex.: http://localhost:3000).'); process.exit(2); }
const host = new URL(BASE).hostname;
if (!ALLOWED.includes(host)) { console.error(`Host ${host} fora de E2E_ALLOWED_HOSTS (${ALLOWED.join(', ')}). Recusado.`); process.exit(2); }

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); }
catch { console.error('Playwright ausente. Instale: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

mkdirSync(OUT, { recursive: true });
export const ACCOUNTS = {
  aluno: { path: '/aluno/entrar', email: env.E2E_STUDENT_EMAIL, password: env.E2E_STUDENT_PASSWORD, home: /\/aluno\// },
  instrutor: { path: '/instrutor/entrar', email: env.E2E_INSTRUCTOR_EMAIL, password: env.E2E_INSTRUCTOR_PASSWORD, home: /\/instrutor\// },
  afiliado: { path: '/afiliado/entrar', email: env.E2E_AFFILIATE_EMAIL, password: env.E2E_AFFILIATE_PASSWORD, home: /\/afiliado\// },
  admin: { path: '/admin/entrar', email: env.E2E_ADMIN_EMAIL, password: env.E2E_ADMIN_PASSWORD, home: /\/admin\//, totp: env.E2E_ADMIN_TOTP_SECRET },
};
export const VIEWPORTS = { celular: { width: 390, height: 844 }, pc: { width: 1280, height: 900 } };

export const browser = await chromium.launch();
export const shot = async (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

export async function login(area, viewport) {
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

