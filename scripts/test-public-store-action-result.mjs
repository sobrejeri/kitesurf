import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as store from '../src/lib/public-store.ts';

const code = ts.transpileModule(readFileSync('src/app/actions/public-store.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let calls = 0, result = { data: null, error: null }, throws = false;
const db = { async rpc() { calls++; if (throws) throw Error('Network response lost'); return result; } };
const deps = {
  'next/headers': { async cookies() { return { get() { return undefined; } }; } },
  '@/lib/public-store': store,
  '@/lib/supabase/server': { async createSupabaseServerClient(area) { assert.equal(area, 'aluno'); return db; } },
};
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, require(id) { if (!(id in deps)) throw Error(id); return deps[id]; } });
const place = module.exports.placePublicOrder;
const id = '11111111-1111-4111-8111-111111111111';
const input = { slug: 'loja-teste', customer: 'Cliente teste', phone: '88999990000',
  items: [{ kind: 'product', unit_id: id, product_id: id, qty: 1 }] };
assert.equal((await place({})).retryable, true); assert.equal(calls, 0, 'validation rejection never sends a write');
for (const response of [{ data: null, error: null }, { data: [], error: null },
  { data: [{ order_number: 'PED-1' }], error: null }, { data: null, error: { message: 'fetch failed' } },
  { data: null, error: { code: '54000', message: 'Too many requests' } }]) {
  result = response; const responseResult = await place(input);
  assert.equal(responseResult.ok, false); assert.equal(responseResult.retryable, false);
  assert.match(responseResult.error, /Fale com a escola/);
}
throws = true; assert.equal((await place(input)).retryable, false); throws = false;
result = { data: [{ order_number: 'PED-1', token: 'a'.repeat(64) }], error: null };
const success = await place(input); assert.equal(success.ok, true); assert.equal(success.number, 'PED-1');
console.log('PASS: actual public order action unlocks only pre-write validation, preserving unknown RPC and response outcomes');
