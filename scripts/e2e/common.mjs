/** Configuração, segurança e login compartilhados pelos scripts de E2E (run.mjs) e de varredura de telas (crawl.mjs). */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { totp } from './totp.mjs';
import { validateBase, assertPageOrigin, secureContext, createRedactor, maskedScreenshot } from './security.mjs';

const env = process.env;
let validatedBase;
try { validatedBase = validateBase(env.E2E_BASE_URL ?? '', (env.E2E_ALLOWED_HOSTS ?? 'localhost,127.0.0.1,vento-kitesurf.onrender.com').split(',').map(host => host.trim())); }
catch { console.error('Origem E2E inválida ou não autorizada.'); process.exit(2); }
export const BASE = validatedBase;
export const OUT = env.E2E_OUT ?? 'e2e-out';
export const WRITE = env.E2E_WRITE === 'sim';
export const ALLOWED = (env.E2E_ALLOWED_HOSTS ?? 'localhost,127.0.0.1,vento-kitesurf.onrender.com').split(',').map((host) => host.trim()).filter(Boolean);
export const results = [];
const redactor = createRedactor(env);
export const record = (id, titulo, status, detalhe = '') => {
  const entry = Object.fromEntries(Object.entries({ id, titulo, status, detalhe }).map(([key, value]) => [key, redactor.redact(value)]));
  results.push(entry);
  console.log(`${entry.status.padEnd(9)} ${entry.id} ${entry.titulo}${entry.detalhe ? ` — ${entry.detalhe}` : ''}`);
};

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

const rawBrowser = await chromium.launch();
export const browser = { newContext: (options) => secureContext(rawBrowser, BASE, options), close: () => rawBrowser.close() };
export const shot = async (page, name) => maskedScreenshot(page, join(OUT, `${name}.png`), BASE, redactor.values()).catch(() => {});
export const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

export async function login(area, viewport) {
  const account = ACCOUNTS[area];
  if (!account.email || !account.password) return { error: 'credenciais não informadas' };
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(BASE + account.path, { waitUntil: 'networkidle' });
    assertPageOrigin(page, BASE);
    await page.fill('input[name="email"]', account.email);
    assertPageOrigin(page, BASE);
    await page.fill('input[name="password"]', account.password);
    assertPageOrigin(page, BASE);
    await Promise.all([page.waitForURL((url) => url.origin === BASE && !url.pathname.endsWith('/entrar'), { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
    assertPageOrigin(page, BASE);
    if (/\/verificacao/.test(new URL(page.url()).pathname)) {
      if (!account.totp) { await context.close(); return { error: 'autenticador da conta fictícia não informado' }; }
      const code = totp(account.totp);
      redactor.addSecret(code);
      assertPageOrigin(page, BASE);
      await page.fill('input[name="code"]', code);
      assertPageOrigin(page, BASE);
      await Promise.all([page.waitForURL((url) => url.origin === BASE && !/\/verificacao/.test(url.pathname), { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
    }
    assertPageOrigin(page, BASE);
    if (!account.home.test(new URL(page.url()).pathname) || /\/entrar|\/verificacao/.test(new URL(page.url()).pathname)) {
      await context.close();
      return { error: 'login não concluiu na área esperada' };
    }
    return { context, page };
  } catch {
    // Playwright errors may contain fill values or request bodies. Never copy
    // those errors, page alerts, console output or authentication URLs.
    await context.close().catch(() => {});
    return { error: 'login não concluiu com segurança' };
  }
}
