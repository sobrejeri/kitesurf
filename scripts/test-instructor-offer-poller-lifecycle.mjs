import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real component effect with controlled hooks, events and timers.
// No React rendering, browser, Next server, database or network is involved.
const source = readFileSync(new URL('../src/components/instructor/offer-poller.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const intervals = new Map();
const timeouts = new Map();
const listeners = new Map();
let serial = 0;
let effect;
let refreshes = 0;
let updates = 0;
const busy = { current: false };
const document = {
  visibilityState: 'visible',
  addEventListener(name, callback) {
    assert.equal(name, 'visibilitychange');
    assert.equal(listeners.has(name), false, 'exactly one listener per mounted effect');
    listeners.set(name, callback);
  },
  removeEventListener(name, callback) {
    assert.equal(listeners.get(name), callback, 'cleanup removes its own listener');
    listeners.delete(name);
  },
};
const window = {
  setInterval(callback, ms) { const id = ++serial; intervals.set(id, { callback, ms }); return id; },
  clearInterval(id) { intervals.delete(id); },
  setTimeout(callback, ms) { const id = ++serial; timeouts.set(id, { callback, ms }); return id; },
  clearTimeout(id) { timeouts.delete(id); },
};
const module = { exports: {} };
const router = { refresh() { refreshes++; } };
vm.runInNewContext(compiled, {
  module, exports: module.exports, document, window, Date, Intl,
  require(id) {
    if (id === 'react') return {
      useRef(initial) { assert.equal(initial, false); return busy; },
      useState(initial) { return [initial, () => { updates++; }]; },
      useEffect(callback) { effect = callback; },
    };
    if (id === 'next/navigation') return { useRouter: () => router };
    if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
    throw new Error('Unexpected dependency: ' + id);
  },
});
module.exports.InstructorOfferPoller();
assert.equal(typeof effect, 'function');
let cleanup = effect();
assert.equal(intervals.size, 1);
assert.equal([...intervals.values()][0].ms, module.exports.OFFER_POLL_MS);
const tick = () => [...intervals.values()][0].callback();
const releaseCooldown = () => {
  assert.equal(timeouts.size, 1);
  const [id, timer] = [...timeouts.entries()][0];
  assert.equal(timer.ms, 1500);
  timeouts.delete(id);
  timer.callback();
};
document.visibilityState = 'hidden';
tick();
assert.equal(refreshes, 0, 'hidden tab must not refresh');
document.visibilityState = 'visible';
listeners.get('visibilitychange')();
assert.equal(refreshes, 1, 'returning to visible tab refreshes immediately');
assert.equal(updates, 1);
tick();
listeners.get('visibilitychange')();
assert.equal(refreshes, 1, 'cooldown suppresses duplicate visibility/timer calls');
releaseCooldown();
tick();
assert.equal(refreshes, 2, 'subsequent polling resumes after cooldown');
assert.equal(updates, 2);

// StrictMode and route changes can clean up while the cooldown is pending.
const staleInterval = [...intervals.values()][0].callback;
const staleListener = listeners.get('visibilitychange');
cleanup();
assert.equal(intervals.size, 0, 'unmount cancels repeating timer');
assert.equal(listeners.size, 0, 'unmount removes event listener');
assert.equal(timeouts.size, 0, 'unmount also cancels the pending cooldown');
assert.equal(busy.current, false, 'cleanup does not leave a stale busy ref');
staleInterval();
staleListener();
assert.equal(refreshes, 2, 'callbacks already queued before unmount cannot refresh');
assert.equal(updates, 2, 'queued callbacks cannot update an unmounted component');

// React StrictMode runs setup again with the same refs: the new effect must work.
cleanup = effect();
tick();
assert.equal(refreshes, 3, 'effect setup after cleanup is not blocked by the previous cooldown');
cleanup();
assert.equal(intervals.size + timeouts.size + listeners.size, 0);
console.log('PASS: instructor offer poller visibility, cooldown, cleanup and StrictMode effect lifecycle (controlled hooks/timers)');
