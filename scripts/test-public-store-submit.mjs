import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as store from '../src/lib/public-store.ts';

const source = ts.transpileModule(readFileSync('src/app/escola/[slug]/store-client.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function render(placePublicOrder) {
  const module = { exports: {} }; const transitions = [], errors = [], navigations = [];
  const cart = [{ key: 'p:one', kind: 'product', unit_id: 'u1', product_id: 'p1', qty: 1, label: 'Produto' }];
  const initial = [cart, true, true, null, 'Cliente', '88999990000', '']; let stateIndex = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const deps = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    react: { useState() { const i = stateIndex++; return [initial[i], value => { if (i === 3) errors.push(value); }]; },
      useRef(value) { return { current: value }; }, useEffect() {}, useMemo(fn) { return fn(); },
      useTransition() { return [false, fn => transitions.push(Promise.resolve().then(fn))]; } },
    'next/navigation': { useRouter() { return { push(url) { navigations.push(url); } }; } },
    '@/app/actions/public-store': { placePublicOrder, loadFreeSlots() { throw Error('Unexpected slots'); } },
    '@/lib/public-store': store,
  };
  vm.runInNewContext(source, { module, exports: module.exports, require(id) { if (!(id in deps)) throw Error(id); return deps[id]; },
    sessionStorage: { removeItem() {} } });
  const tree = module.exports.StoreClient({ catalog: { store: { slug: 'loja-teste' }, units: [], services: [], products: [], rentals: [] } });
  const find = node => !node ? null : Array.isArray(node) ? node.map(find).find(Boolean)
    : node.type === 'button' && node.props.children === 'Enviar pedido' ? node : find(node.props?.children);
  const button = find(tree); assert.ok(button);
  return { click: button.props.onClick, transitions, errors, navigations };
}

let calls = 0, resolve;
const wait = new Promise(done => { resolve = done; });
const success = render(async () => { calls++; return wait; });
success.click(); success.click(); await Promise.resolve();
assert.equal(calls, 1, 'same-tick clicks must create only one request');
resolve({ ok: true, number: 'ORDER-1', token: 'secret' }); await Promise.all(success.transitions);
success.click(); await Promise.resolve(); assert.equal(calls, 1, 'success stays locked until navigation');
assert.equal(success.navigations.length, 1);

calls = 0;
const rejected = render(async () => { calls++; return { ok: false, error: 'Dados inválidos' }; });
rejected.click(); await Promise.all(rejected.transitions); rejected.click(); await Promise.all(rejected.transitions);
assert.equal(calls, 2, 'an explicit rejection permits a corrected submission');

calls = 0;
const uncertain = render(async () => { calls++; throw Error('Network response lost'); });
uncertain.click(); await Promise.all(uncertain.transitions); uncertain.click(); await Promise.resolve();
assert.equal(calls, 1, 'uncertain submission must not repeat blindly');
assert.match(uncertain.errors.at(-1), /Fale com a escola/);
assert.equal(uncertain.navigations.length, 0);
console.log('PASS: actual storefront submit handler blocks same-tick duplicates, holds unknown outcomes and unlocks explicit rejections');
