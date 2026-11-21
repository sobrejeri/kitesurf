import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://vento.example';
const handlers = {};
const online = new Response('fixture', { status: 403 });
let networkAvailable = true;
vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
  self: { location: { origin }, addEventListener(name, handler) { handlers[name] = handler; } },
  URL, Response,
  async fetch() {
    if (!networkAvailable) throw new TypeError('offline');
    return online;
  },
});

function request(path, method = 'GET', mode = 'navigate') {
  let result;
  handlers.fetch({
    request: { url: new URL(path, origin).href, method, mode },
    respondWith(response) { result = response; },
  });
  return result;
}

assert.equal(await request('/aluno/aulas'), online);
networkAvailable = false;
for (const path of ['/', '/aluno/aulas', '/instrutor/aula', '/admin', '/afiliado/inicio']) {
  const response = await request(path);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(await response.text(), /Tentar novamente/);
}
assert.equal(request('/aluno/aulas', 'POST'), undefined);
assert.equal(request('/aluno/aulas', 'GET', 'cors'), undefined);
assert.equal(request('/api/version'), undefined);
assert.equal(request('https://other.example/admin'), undefined);
console.log('PASS: offline document recovery, online status preservation and request isolation');
