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
