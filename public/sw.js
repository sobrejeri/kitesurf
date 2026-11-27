// Serve the current app online. Only an offline document navigation gets the
// generic recovery screen. Authenticated responses never enter a worker cache.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname !== '/' && !/^\/(aluno|instrutor|admin|afiliado|pousada)(\/|$)/.test(url.pathname)) return;

  event.respondWith(fetch(request).catch(() => new Response(
    `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sem conexão · VentoKite</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111827;color:#fff;font:1rem/1.5 system-ui}
main{max-width:28rem;padding:2rem}h1{line-height:1.2}a{display:inline-block;color:#a9d7ff;padding:.75rem 0}
</style>
<main><h1>Sem conexão</h1><p>Conecte-se à internet para consultar suas aulas e atualizar a agenda.</p>
<a href="">Tentar novamente</a></main></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  )));
});


// Passive receiver only: subscribing, user consent and server delivery are
// configured separately. Keep private message/reservation content off the lock screen.
function pushDestination(value) {
  const fallback = new URL('/', self.location.origin).href;
  if (typeof value !== 'string' || value.length > 2048) return fallback;
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || url.username || url.password
      || (url.pathname !== '/' && !/^\/(aluno|instrutor|admin|afiliado|pousada)(\/|$)/.test(url.pathname))) return fallback;
    return url.href;
  } catch { return fallback; }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
  } catch { /* Invalid/empty payload still produces a generic visible notice. */ }
  const options = {
    body: 'Você tem um novo aviso. Abra o app para conferir.',
    icon: '/icon-192.png',
    data: { href: pushDestination(payload.href) },
  };
  // Re-delivery of the same notice replaces its existing OS notification.
  // No global tag: distinct notices must not overwrite each other.
  if (typeof payload.notificationId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.notificationId)) {
    options.tag = 'vento-' + payload.notificationId.toLowerCase();
  }
  event.waitUntil(self.registration.showNotification('VentoKite', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Validate again: notification data is not an authorization boundary.
  const href = pushDestination(event.notification.data?.href);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url === href && typeof client.focus === 'function') {
        try { await client.focus(); return; } catch { /* Try another window or open the destination. */ }
      }
    }
    // Do not navigate another open page and discard an unfinished form.
    await self.clients.openWindow(href);
  })());
});
