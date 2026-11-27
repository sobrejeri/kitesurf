import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod/v4';

const compile = path => ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const load = (source, dependencies, globals = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, atob, btoa, Uint8Array, Date, URL,
    ...globals, require(id) { if (id in dependencies) return dependencies[id]; throw new Error('Unexpected import ' + id); } });
  return module.exports;
};
const schema = load(compile('src/lib/push-subscription.ts'), { zod: { z } });
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = pair.publicKey.export({ format: 'jwk' });
const p256dh = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
const valid = { endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic', expirationTime: null,
  keys: { p256dh, auth: Buffer.alloc(16, 1).toString('base64url') } };
assert.equal(schema.PushSubscriptionInput.safeParse(valid).success, true);
for (const bad of ['http://fcm.googleapis.com/a', 'https://127.0.0.1/a', 'https://localhost/a',
  'https://evil.example/a', 'https://fcm.googleapis.com:443/a', 'https://user@fcm.googleapis.com/a',
  'https://fcm.googleapis.com/a#fragment', 'https://fcm.googleapis.com/a\n', 'https://fcm.googleapis.com/' + 'x'.repeat(2048)]) {
  assert.equal(schema.PushSubscriptionInput.safeParse({ ...valid, endpoint: bad }).success, false, bad);
}
for (const host of ['updates.push.services.mozilla.com', 'web.push.apple.com', 'wns.notify.windows.com']) {
  assert.equal(schema.PushSubscriptionInput.safeParse({ ...valid, endpoint: 'https://' + host + '/synthetic' }).success, true);
}
for (const input of [{ ...valid, owner_id: 'forged-owner' }, { ...valid, keys: { ...valid.keys, extra: true } },
  { ...valid, keys: { ...valid.keys, p256dh: 'A'.repeat(87) } },
  { ...valid, keys: { ...valid.keys, auth: valid.keys.auth.slice(0, -1) + 'B' } }]) {
  assert.equal(schema.PushSubscriptionInput.safeParse(input).success, false);
}

const actionSource = compile('src/app/actions/push-subscriptions.ts');
function actions({ enabled = 'true', deny = false, rpcError = null } = {}) {
  const calls = [];
  let authChecks = 0;
  const api = load(actionSource, {
    '@/lib/auth': { async requireRole(roles) { authChecks++; assert.deepEqual(Array.from(roles), ['student', 'instructor', 'admin', 'partner']); if (deny) throw new Error('login required'); return { id: 'session-owner' }; } },
    '@/lib/push-subscription': schema,
    '@/lib/supabase/server': { async createSupabaseServerClient() { return { async rpc(name, args) { calls.push({ name, args: args && JSON.parse(JSON.stringify(args)) }); return { error: rpcError }; } }; } },
  }, { process: { env: { NEXT_PUBLIC_VENTO_PUSH_SUBSCRIPTIONS_ENABLED: enabled } } });
  return { api, calls, checks: () => authChecks };
}
let h = actions({ enabled: 'false' });
assert.ok((await h.api.registerPushSubscription(valid)).error);
assert.equal(h.checks(), 0); assert.equal(h.calls.length, 0);
h = actions({ deny: true });
await assert.rejects(h.api.registerPushSubscription(valid), /login required/);
assert.equal(h.calls.length, 0);
h = actions();
for (const bad of [null, { ...valid, owner_id: 'forged' }, { ...valid, expirationTime: Date.now() - 1 },
  { ...valid, endpoint: 'https://evil.example/token' }]) assert.ok((await h.api.registerPushSubscription(bad)).error);
assert.equal(h.calls.length, 0, 'invalid data never reaches the database');
assert.ok((await h.api.registerPushSubscription(valid)).ok);
assert.deepEqual(h.calls[0], { name: 'register_my_push_subscription', args: {
  p_endpoint: valid.endpoint, p_p256dh: valid.keys.p256dh, p_auth: valid.keys.auth, p_expiration_time: null,
} });
assert.ok(!JSON.stringify(await h.api.registerPushSubscription(valid)).includes(valid.endpoint), 'response does not expose endpoint or keys');
h = actions({ rpcError: { code: '42501', message: 'another owner with private endpoint' } });
assert.equal((await h.api.registerPushSubscription(valid)).ok, undefined);
assert.ok(!JSON.stringify(await h.api.registerPushSubscription(valid)).includes('private endpoint'));
h = actions({ enabled: 'false' });
assert.ok((await h.api.revokePushSubscription(valid.endpoint)).ok, 'revocation works with opt-in disabled');
assert.deepEqual(h.calls[0], { name: 'revoke_my_push_subscription', args: { p_endpoint: valid.endpoint } });
assert.equal(h.checks(), 1);

const componentSource = compile('src/components/push-subscription-controls.tsx');
function controls({ enabled = 'true', permission = 'granted', existing = false, unsubscribe = true,
  registerError = null, revokeError = null, key = p256dh, unsupported = false, permissionWork, readyWork } = {}) {
  const calls = [];
  const states = [];
  let stateIndex = 0;
  const timers = new Map();
  let nextTimer = 0;
  const previous = { endpoint: valid.endpoint, async unsubscribe() { calls.push('previous.unsubscribe'); return unsubscribe; } };
  const created = { endpoint: valid.endpoint, toJSON: () => valid, async unsubscribe() { calls.push('created.unsubscribe'); return true; } };
  const manager = {
    async getSubscription() { calls.push('getSubscription'); return existing ? previous : null; },
    async subscribe(options) { assert.equal(options.userVisibleOnly, true); assert.equal(new Uint8Array(options.applicationServerKey).length, 65); calls.push('subscribe'); return created; },
  };
  const navigator = unsupported ? {} : { serviceWorker: { ready: readyWork ?? Promise.resolve({ pushManager: manager }) } };
  const node = (type, props) => ({ type, props });
  const api = load(componentSource, {
    react: { useRef: () => ({ current: false }), useState(initial) { const i = stateIndex++; states[i] = initial; return [initial, value => { states[i] = value; }]; } },
    'react/jsx-runtime': { jsx: node, jsxs: node },
    '@/lib/push-subscription': schema,
    '@/app/actions/push-subscriptions': {
      async registerPushSubscription(input) { assert.deepEqual(input, valid); calls.push('register'); return registerError ? { error: registerError } : { ok: 'activated' }; },
      async revokePushSubscription(endpoint) { assert.equal(endpoint, valid.endpoint); calls.push('revoke'); return revokeError ? { error: revokeError } : { ok: 'revoked' }; },
    },
  }, { navigator, window: unsupported ? {} : { PushManager: function () {}, Notification: {},
    setTimeout(callback, ms) { assert.equal(ms, 8000); const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); } },
    Notification: { requestPermission() { calls.push('permission'); return permissionWork ?? Promise.resolve(permission); } },
    process: { env: { NEXT_PUBLIC_VENTO_PUSH_SUBSCRIPTIONS_ENABLED: enabled, NEXT_PUBLIC_VENTO_PUSH_VAPID_PUBLIC_KEY: key } },
  });
  const tree = api.PushSubscriptionControls();
  const buttons = [];
  const walk = item => { if (!item || typeof item !== 'object') return; if (item.type === 'button') buttons.push(item); for (const child of [item.props?.children].flat()) walk(child); };
  walk(tree);
  return { tree, calls, states, timers, expireReadiness() { assert.equal(timers.size, 1); const [id, callback] = [...timers.entries()][0]; timers.delete(id); callback(); },
    activate: () => buttons[0].props.onClick(), deactivate: () => buttons[1].props.onClick() };
}
let c = controls({ enabled: 'false' });
assert.equal(c.tree, null); assert.deepEqual(c.calls, [], 'disabled feature has no permission/API side effects');
c = controls();
assert.deepEqual(c.calls, [], 'rendering never requests consent or creates a subscription');
await c.activate();
assert.deepEqual(c.calls, ['permission', 'getSubscription', 'subscribe', 'register']);
assert.equal(c.states[1], 'activated');
assert.equal(c.timers.size, 0, 'resolved readiness clears its timeout');
c = controls({ permission: 'denied' }); await c.activate(); assert.deepEqual(c.calls, ['permission']);
c = controls({ key: '' }); await c.activate(); assert.deepEqual(c.calls, []);
c = controls({ unsupported: true }); await c.activate(); assert.deepEqual(c.calls, []);
c = controls({ existing: true }); await c.activate();
assert.deepEqual(c.calls, ['permission', 'getSubscription', 'previous.unsubscribe', 'subscribe', 'register'], 'never silently reuse a previous account endpoint');
c = controls({ existing: true, unsubscribe: false }); await c.activate();
assert.deepEqual(c.calls, ['permission', 'getSubscription', 'previous.unsubscribe']);
c = controls({ registerError: 'registration refused' }); await c.activate();
assert.deepEqual(c.calls, ['permission', 'getSubscription', 'subscribe', 'register', 'created.unsubscribe']);
assert.equal(c.states[1], 'registration refused');
let answerPermission;
c = controls({ permissionWork: new Promise(resolve => { answerPermission = resolve; }) });
const first = c.activate(); const duplicate = c.activate();
assert.deepEqual(c.calls, ['permission'], 'double click cannot request consent or subscribe twice');
answerPermission('granted'); await first; await duplicate;
assert.equal(c.calls.filter(call => call === 'register').length, 1);
c = controls({ existing: true }); await c.deactivate();
assert.deepEqual(c.calls, ['getSubscription', 'revoke', 'previous.unsubscribe'], 'revoke in database before browser unsubscribe');
c = controls({ existing: true, revokeError: 'revocation refused' }); await c.deactivate();
assert.deepEqual(c.calls, ['getSubscription', 'revoke']); assert.equal(c.states[1], 'revocation refused');
c = controls({ readyWork: new Promise(() => {}) });
let stalled = c.activate(); await new Promise(setImmediate); c.expireReadiness(); await stalled;
assert.equal(c.states[0], false, 'readiness timeout releases the disabled buttons');
assert.ok(c.states[1].includes('Não foi possível'));
stalled = c.activate(); await new Promise(setImmediate); c.expireReadiness(); await stalled;
assert.equal(c.calls.filter(call => call === 'permission').length, 2, 'readiness timeout also releases the in-flight guard');
assert.equal(c.calls.includes('subscribe'), false, 'late/unavailable readiness never creates a subscription');
c = controls({ readyWork: new Promise(() => {}) });
stalled = c.deactivate(); c.expireReadiness(); await stalled;
assert.equal(c.states[0], false, 'disable readiness also has bounded waiting');
let resolveLateWorker;
c = controls({ readyWork: new Promise(resolve => { resolveLateWorker = resolve; }) });
stalled = c.activate(); await new Promise(setImmediate); c.expireReadiness(); await stalled;
resolveLateWorker({ pushManager: { async getSubscription() { throw new Error('late readiness must not continue activation'); } } });
await new Promise(setImmediate);
assert.equal(c.calls.includes('subscribe'), false);
assert.equal(c.timers.size, 0);

// Exercise the actual shared signOut action: current-session revocation precedes
// auth signout, while a missing database migration cannot trap the user inside.
const authSource = compile('src/app/actions/auth.ts');
for (const enabled of ['false', 'true']) for (const failRevoke of [false, true]) {
  const calls = [];
  const api = load(authSource, {
    'next/navigation': { redirect(path) { calls.push('redirect:' + path); throw new Error('redirect'); } },
    zod: { z }, '@/lib/auth': {}, '@/lib/env': { SITE_URL: 'https://test.invalid' },
    './errors': { friendlyError: () => 'error' },
    '@/lib/app-areas': { APP_AREAS: {}, AREA_LIST: ['aluno', 'instrutor', 'admin', 'afiliado'] },
    '@/lib/supabase/server': { async currentArea() { return 'aluno'; }, async createSupabaseServerClient(area) {
      assert.equal(area, 'aluno');
      return { async rpc(name) { assert.equal(name, 'revoke_my_push_session_subscriptions'); calls.push('revoke-session'); if (failRevoke) throw new Error('offline'); return { error: null }; },
        auth: { async signOut(options) { assert.equal(options.scope, 'local'); calls.push('signout'); } } };
    } },
  }, { process: { env: { NEXT_PUBLIC_VENTO_PUSH_SUBSCRIPTIONS_ENABLED: enabled } } });
  await assert.rejects(api.signOut(), /redirect/);
  assert.deepEqual(calls, enabled === 'true' ? ['revoke-session', 'signout', 'redirect:/aluno/entrar'] : ['signout', 'redirect:/aluno/entrar']);
}
console.log('PASS: push opt-in disabled by default, strict owner-free input, authenticated RPCs, explicit consent, account-safe renewal, rollback, revocation and current-session logout (isolated mocks)');
