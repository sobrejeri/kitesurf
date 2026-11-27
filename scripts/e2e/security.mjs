/** Pure safety helpers: no environment reads, browser launch or network. */
export function validateBase(raw, allowedHosts) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('E2E_BASE_URL inválida.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!allowedHosts.includes(url.hostname) || url.username || url.password || url.search || url.hash
    || url.pathname !== '/' || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) {
    throw new Error('Origem E2E recusada. Use uma origem HTTPS autorizada, ou HTTP local, sem caminho ou credenciais.');
  }
  return url.origin;
}

export function assertPageOrigin(page, base) {
  let origin;
  try { origin = new URL(page.url()).origin; } catch { /* fail closed */ }
  if (origin !== base) throw new Error('Navegação E2E fora da origem autorizada.');
}

export async function secureContext(browser, base, options) {
  // Routing does not intercept a service worker's requests. Disable workers in
  // this harness so every navigation, including redirects/popups, is checked.
  const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
  context.on('page', (page) => page.on('framenavigated', (frame) => {
    // Non-HTTP navigations may not pass through routing. Check their origin
    // too; about:blank is only the initial empty page and
    // assertPageOrigin still rejects it before any credential or screenshot.
    if (frame.url() === 'about:blank') return;
    let origin;
    try { origin = new URL(frame.url()).origin; } catch { /* fail closed */ }
    if (origin !== base) void page.close().catch(() => {});
  }));
  await context.route('**/*', async (route) => {
    const request = route.request();
    // Server Actions submit credentials with fetch POST, not a document
    // navigation. Guard these requests and their redirects as well. External
    // GET/HEAD resources remain usable; external writes fail closed.
    const method = request.method();
    if (request.isNavigationRequest() || !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      let origin;
      try { origin = new URL(request.url()).origin; } catch { /* fail closed */ }
      if (origin !== base) return route.abort('blockedbyclient');
      // Inspect every redirect before the browser can follow it. Merely
      // checking the final URL is too late for a cross-origin credential POST.
      try {
        const response = await route.fetch({ maxRedirects: 0, timeout: 30_000 });
        const location = response.headers().location;
        if (response.status() >= 300 && response.status() < 400 && location
          && new URL(location, request.url()).origin !== base) return route.abort('blockedbyclient');
        return route.fulfill({ response });
      } catch { return route.abort('blockedbyclient').catch(() => {}); }
    }
    return route.continue();
  });
  return context;
}

export function createRedactor(env = {}) {
  const secrets = new Set(Object.entries(env)
    .filter(([key, value]) => /^E2E_/.test(key) && /PASSWORD|SECRET|TOKEN|EMAIL/i.test(key) && typeof value === 'string' && value)
    .map(([, value]) => value));
  for (const [key, value] of Object.entries(env)) {
    if (/^E2E_.*TOTP.*SECRET$/.test(key) && typeof value === 'string' && value.trim()) {
      secrets.add(value.replace(/[\s=-]/g, '').toUpperCase());
    }
  }
  const addSecret = (value) => { if (typeof value === 'string' && value) secrets.add(value); };
  const redact = (value) => {
    let text = String(value ?? '');
    for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
      text = text.split(secret).join('[REDACTED]');
      text = text.split(encodeURIComponent(secret)).join('[REDACTED]');
    }
    return text
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
      .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
      .replace(/\b(access_token|refresh_token|token|password|secret|code)=([^\s&#]+)/gi, '$1=[REDACTED]')
      .replace(/\b\d{6}\b/g, '[REDACTED_CODE]')
      .replace(/[\r\n\t]/g, ' ');
  };
  return { redact, addSecret, values: () => [...secrets] };
}

export async function maskedScreenshot(page, path, base, secrets = []) {
  assertPageOrigin(page, base);
  if (/\/(entrar|verificacao|criar-conta|recuperar|redefinir|configuracao|configuracoes|conta|perfil|seguranca|autenticador)(?:\/|$)/.test(new URL(page.url()).pathname)) return false;
  // Mask every input: email, password, TOTP and presence codes must never enter
  // the artifact, even if an input type changes or validation echoes its value.
  const mask = [page.locator('form, input, textarea, [role="alert"], pre, code, img, svg, canvas, [data-e2e-sensitive]'), page.getByText(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b\d{4,8}\b/)];
  for (const secret of secrets) mask.push(page.getByText(secret, { exact: false }));
  return page.screenshot({ path, fullPage: true, mask });
}
