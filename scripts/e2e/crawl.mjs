#!/usr/bin/env node
/**
 * Varredura de TODAS as telas estáticas de cada área (descobertas em src/app/…/page.tsx), no celular (390 px) e no PC (1280 px),
 * com as contas fictícias de cada perfil. Só LÊ: navega por URL (GET), nunca clica em botões nem envia formulários.
 * Procura, por tela: erro HTTP, rolagem horizontal, erros de console, requisições que falharam, imagens quebradas ou sem alt,
 * botões/links/campos sem nome acessível, alvos de toque menores que 40 px no celular, idioma e título ausentes.
 * Resultado: crawl-out/telas.md e telas.json (PASS/FAIL/BLOQUEADO por tela). Rotas com [id] são puladas (precisam de um id real).
 * Mesmas variáveis e travas de segurança do E2E (docs/E2E_AUTENTICADO.md).
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ACCOUNTS, BASE, OUT, VIEWPORTS, browser, login, results, record, shot } from './common.mjs';

const ROOT = new URL('../../src/app/', import.meta.url).pathname;
const MAX_TOUCH = 40;

function discover(dir = ROOT, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) discover(full, found);
    else if (entry === 'page.tsx') {
      const route = '/' + relative(ROOT, dir).split('/').filter((part) => !/^\(.*\)$/.test(part)).join('/');
      found.push(route === '/' ? '/' : route.replace(/\/$/, ''));
    }
  }
  return found;
}
const routes = [...new Set(discover())].sort();
const dynamic = routes.filter((route) => route.includes('['));
const areaOf = (route) => ['aluno', 'instrutor', 'admin', 'afiliado'].find((area) => route === `/${area}` || route.startsWith(`/${area}/`)) ?? 'publico';
const isEntry = (route) => /\/(entrar|criar-conta|recuperar|redefinir|verificacao)$/.test(route);

async function audit(page, route, label) {
  const problems = [];
  const consoleErrors = [];
  const failed = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 120)); });
  page.on('requestfailed', (request) => failed.push(`${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ''}`));
  page.on('response', (response) => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(BASE).origin) failed.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  const response = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60000 }).catch((error) => ({ error }));
  if (response?.error) return { problems: [`não abriu: ${String(response.error.message).slice(0, 80)}`], path: route };
  const finalPath = new URL(page.url()).pathname;
  if (response && response.status() >= 400) problems.push(`HTTP ${response.status()}`);
  const info = await page.evaluate((maxTouch) => {
    const named = (element) => Boolean((element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.getAttribute('title') || element.textContent || '').trim())
      || Boolean(element.querySelector('img[alt]:not([alt=""]), svg[aria-label]'));
    const visible = (element) => { const r = element.getBoundingClientRect(); const s = getComputedStyle(element); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const labelled = (input) => Boolean(input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || input.closest('label') || (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) || input.getAttribute('title'));
    const small = [];
    document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]').forEach((element) => {
      if (!visible(element) || element.closest('nextjs-portal, [data-nextjs-dev-tools-button]')) return;
      const r = element.getBoundingClientRect();
      if (Math.min(r.width, r.height) < maxTouch && !(element.tagName === 'INPUT' && ['checkbox', 'radio'].includes(element.type))) small.push(`${element.tagName.toLowerCase()}${element.textContent ? `"${element.textContent.trim().slice(0, 18)}"` : ''} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lang: document.documentElement.lang, title: document.title,
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0 && visible(image)).length,
      noAlt: [...document.images].filter((image) => visible(image) && !image.hasAttribute('alt')).length,
      unnamedControls: [...document.querySelectorAll('button, a[href], [role=button]')].filter((element) => visible(element) && !named(element)).length,
      unlabelledFields: [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]), select, textarea')].filter((input) => visible(input) && !labelled(input)).length,
      small: small.slice(0, 6), smallCount: small.length,
    };
  }, MAX_TOUCH);
  if (info.overflow > 0) problems.push(`rolagem horizontal +${info.overflow}px`);
  if (!info.lang) problems.push('sem lang no <html>');
  if (!info.title) problems.push('sem título');
  if (info.brokenImages) problems.push(`${info.brokenImages} imagem(ns) quebrada(s)`);
  if (info.noAlt) problems.push(`${info.noAlt} imagem(ns) sem alt`);
  if (info.unnamedControls) problems.push(`${info.unnamedControls} botão(ões)/link(s) sem nome`);
  if (info.unlabelledFields) problems.push(`${info.unlabelledFields} campo(s) sem rótulo`);
  if (label === 'celular' && info.smallCount) problems.push(`${info.smallCount} alvo(s) de toque < ${MAX_TOUCH}px (${info.small.slice(0, 3).join('; ')})`);
  if (consoleErrors.length) problems.push(`console: ${consoleErrors[0]}`);
  if (failed.length) problems.push(`requisição: ${failed[0]}`);
  page.removeAllListeners('console'); page.removeAllListeners('requestfailed'); page.removeAllListeners('response');
  return { problems, path: finalPath };
}

const sessions = {};
for (const area of Object.keys(ACCOUNTS)) {
  const result = await login(area, VIEWPORTS.celular);
  if (result.error) record(`login.${area}`, `Login do ${area}`, 'BLOQUEADO', result.error); else sessions[area] = result;
}
for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  for (const route of routes) {
    if (route.includes('[')) continue;
    const area = areaOf(route);
    let page; let context;
    if (area === 'publico' || isEntry(route)) { context = await browser.newContext({ viewport }); page = await context.newPage(); }
    else if (sessions[area]) { page = sessions[area].page; await page.setViewportSize(viewport); }
    else { record(`${route}.${label}`, `${route} (${label})`, 'BLOQUEADO', `sem sessão de ${area}`); continue; }
    const { problems, path } = await audit(page, route, label);
    if (!isEntry(route) && area !== 'publico' && /\/entrar|\/verificacao/.test(path)) problems.push(`redirecionou para ${path}: sessão não vale nesta tela`);
    if (problems.length) await shot(page, `${route.replace(/\//g, '_')}-${label}`);
    record(`${route}.${label}`, `${route} (${label})`, problems.length ? 'FAIL' : 'PASS', problems.join(' | '));
    if (context) await context.close();
  }
}
for (const session of Object.values(sessions)) await session.context.close();
await browser.close();
const total = (status) => results.filter((item) => item.status === status).length;
const summary = { quando: new Date().toISOString(), base: BASE, rotas: routes.length, puladas_com_id: dynamic, PASS: total('PASS'), FAIL: total('FAIL'), BLOQUEADO: total('BLOQUEADO') };
writeFileSync(join(OUT, 'telas.json'), JSON.stringify({ summary, results }, null, 2));
writeFileSync(join(OUT, 'telas.md'), `# Varredura de telas ${summary.quando}\n\nBase: ${BASE} · ${routes.length} rotas · puladas (precisam de id): ${dynamic.length}\n\nPASS ${summary.PASS} · FAIL ${summary.FAIL} · BLOQUEADO ${summary.BLOQUEADO}\n\n| Tela | Resultado | Problemas |\n|---|---|---|\n${results.map((item) => `| ${item.id} | ${item.status} | ${item.detalhe.replace(/\|/g, '/')} |`).join('\n')}\n`);
console.log(`\nPASS ${summary.PASS} · FAIL ${summary.FAIL} · BLOQUEADO ${summary.BLOQUEADO} — ${OUT}/telas.md`);
process.exit(summary.FAIL > 0 ? 1 : 0);
