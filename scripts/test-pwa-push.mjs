import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://vento.example';
const handlers = {};
const notices = [];
const opened = [];
let windows = [];
let showFailure = null;
let completeShow;
let delayedShow = false;
vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
  URL,
  self: {
    location: { origin },
    addEventListener(name, handler) { handlers[name] = handler; },
    registration: {
      showNotification(title, options) {
        notices.push({ title, options: JSON.parse(JSON.stringify(options)) });
        if (showFailure) return Promise.reject(showFailure);
        if (delayedShow) return new Promise(resolve => { completeShow = resolve; });
        return Promise.resolve();
      },
    },
    clients: {
      async matchAll(options) {
        assert.equal(options.type, 'window');
        assert.equal(options.includeUncontrolled, true);
        return windows;
      },
      async openWindow(href) { opened.push(href); },
    },
  },
});
assert.equal(typeof handlers.push, 'function', 'the installed worker receives push');
assert.equal(typeof handlers.notificationclick, 'function', 'the installed worker handles clicks');
function push(payload, malformed = false) {
  let work;
  handlers.push({
    data: payload === undefined ? null : { json() { if (malformed) throw new SyntaxError('bad JSON'); return payload; } },
    waitUntil(promise) { assert.equal(work, undefined); work = promise; },
  });
  assert.ok(work && typeof work.then === 'function', 'notification work extends event lifetime');
  return work;
}
async function click(href) {
  let work;
  let closed = false;
  handlers.notificationclick({
    notification: { data: href === undefined ? undefined : { href }, close() { closed = true; } },
    waitUntil(promise) { work = promise; },
  });
  assert.equal(closed, true);
  assert.ok(work && typeof work.then === 'function', 'click work extends event lifetime');
  await work;
}
const id = '00000000-0000-4000-8000-000000000001';
await push({ notificationId: id, href: '/instrutor/avisos', title: 'PRIVATE NAME', body: 'PRIVATE MESSAGE', image: 'https://other.example/pixel' });
assert.deepEqual(notices.at(-1), {
  title: 'VentoKite',
  options: { body: 'Você tem um novo aviso. Abra o app para conferir.', icon: '/icon-192.png',
    data: { href: origin + '/instrutor/avisos' }, tag: 'vento-' + id },
});
assert.ok(!JSON.stringify(notices).includes('PRIVATE'), 'private payload text must not reach lock-screen options');
await push({ notificationId: id.toUpperCase(), href: '/instrutor/avisos' });
assert.equal(notices.at(-1).options.tag, 'vento-' + id, 'same notice has stable replacement tag');
await push({ notificationId: id.replace(/1$/, '2'), href: '/aluno/avisos' });
assert.notEqual(notices.at(-1).options.tag, 'vento-' + id, 'distinct notices do not share a tag');
for (const value of [undefined, null, [], 'text', 42]) {
  await push(value);
  assert.equal(notices.at(-1).options.data.href, origin + '/');
  assert.equal(notices.at(-1).options.tag, undefined);
}
await push({}, true);
assert.equal(notices.at(-1).options.data.href, origin + '/', 'malformed JSON degrades to a generic notice');
for (const href of ['https://evil.example/aluno', '//evil.example/admin', 'javascript:alert(1)',
  'data:text/html,test', '/api/internal/queue-maintenance', '/alunox/avisos', '/publico',
  'https://user:pass@vento.example/aluno/avisos', '/'.repeat(2050), {}, 5]) {
  await push({ href, notificationId: 'not-an-id' });
  assert.equal(notices.at(-1).options.data.href, origin + '/', 'unsafe push destination rejected: ' + String(href));
  assert.equal(notices.at(-1).options.tag, undefined);
  await click(href);
  assert.equal(opened.at(-1), origin + '/', 'click must validate data independently');
}
for (const href of ['/', '/aluno/avisos', '/instrutor/solicitacao', '/admin/avisos',
  '/afiliado/inicio', '/pousada/inicio', origin + '/aluno/reserva/' + id]) {
  await push({ href });
  assert.equal(notices.at(-1).options.data.href, new URL(href, origin).href);
}
let focused = 0;
windows = [{ url: origin + '/aluno/avisos', async focus() { focused++; } }];
const beforeOpen = opened.length;
await click('/aluno/avisos');
assert.equal(focused, 1, 'focus a window already on the destination');
assert.equal(opened.length, beforeOpen, 'do not duplicate the destination window');
windows = [{ url: origin + '/aluno/reservar', async focus() { throw new Error('should not focus another page'); },
  async navigate() { throw new Error('must not discard an unfinished form'); } }];
await click('/aluno/avisos');
assert.equal(opened.at(-1), origin + '/aluno/avisos');
windows = [{ url: origin + '/aluno/avisos', async focus() { throw new Error('closed window'); } }];
await click('/aluno/avisos');
assert.equal(opened.at(-1), origin + '/aluno/avisos', 'failed focus falls back to opening destination');
delayedShow = true;
let settled = false;
const pending = push({}).then(() => { settled = true; });
await Promise.resolve();
assert.equal(settled, false, 'waitUntil must cover delayed showNotification completion');
completeShow();
await pending;
delayedShow = false;
showFailure = new Error('permission denied');
await assert.rejects(push({}), /permission denied/, 'display failures are not reported as successful delivery');
console.log('PASS: push receiver privacy, payload fallback, same-origin routes, stable notice tags, click focus and event lifetime (worker VM; no device delivery)');
