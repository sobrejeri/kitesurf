// #92: a solicitação precisa aparecer para o instrutor sem ele recarregar a tela (a oferta vale 2 minutos; com um instrutor só não há "próximo da fila").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const poller = readFileSync('src/components/instructor/offer-poller.tsx', 'utf8');
const page = readFileSync('src/app/instrutor/(app)/solicitacao/page.tsx', 'utf8');
assert.ok(poller.startsWith("'use client';"), 'o poller é um componente de cliente');
const ms = Number(/OFFER_POLL_MS = ([\d_]+);/.exec(poller)?.[1].replace(/_/g, ''));
assert.ok(ms >= 5_000 && ms <= 15_000, `intervalo de atualização entre 5 e 15 s (a oferta vale 2 min): ${ms}`);
for (const needle of ["document.visibilityState !== 'visible'", 'router.refresh()', "addEventListener('visibilitychange'", 'clearInterval', 'busy.current']) {
  assert.ok(poller.includes(needle), `o poller precisa de: ${needle}`);
}
assert.ok(!/fetch\(|supabase|service_role/i.test(poller), 'o poller só atualiza a tela: não chama banco nem API');
assert.ok(page.includes("import { InstructorOfferPoller }") && page.includes('<InstructorOfferPoller />'), 'a caixa de solicitações usa o poller');
assert.ok(page.includes("eq('status','offered')") && page.includes(".gt('expires_at'"), 'a caixa só lista ofertas abertas e dentro do prazo');
assert.ok(page.includes('os detalhes não puderam ser carregados'), 'oferta sem os detalhes da solicitação (RLS) é avisada ao instrutor, não escondida');
console.log('Instructor offer visibility checks passed.');
