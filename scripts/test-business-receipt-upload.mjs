import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync('src/app/api/business/payment-receipt/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
let viewer = { id: 'owner' }, access = true, accessError = null, uploadError = null;
let uploads = [];
const bucket = { async upload(path, file, options) { uploads.push({ path, file, options }); return { error: uploadError }; } };
const db = { async rpc(name, args) { assert.equal(name, 'business_payment_receipt_access'); assert.equal(args.p_write, true); return { data: access, error: accessError }; },
  storage: { from(name) { assert.equal(name, 'vento-business-payment-receipts'); return bucket; } } };
const env = { NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED: 'true' };
const deps = {
  'next/server': { NextResponse: { json(body, init = {}) { return { body, status: init.status ?? 200 }; } } },
  '@/lib/auth': { async getViewer() { return viewer; } },
  '@/lib/business/payment-receipt-feature': { businessReceiptsEnabled() { return env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED === 'true'; } },
  '@/lib/supabase/server': { async createSupabaseServerClient() { return db; } },
};
vm.runInNewContext(code, { module, exports: module.exports, require(id) { if (!(id in deps)) throw Error(id); return deps[id]; },
  process: { env }, URL, File, Uint8Array, Number });
const paymentId = '11111111-1111-4111-8111-111111111111';
const pdf = new File(['%PDF-1.7'], 'receipt.pdf', { type: 'application/pdf' });
function request({ origin = 'https://vento.example', host = 'vento.example', length = '200', id = paymentId, file = pdf } = {}) {
  const headers = new Headers({ origin, host, 'content-length': length });
  return { headers, async formData() { const data = new FormData(); data.set('paymentId', id); data.set('file', file); return data; } };
}
const post = module.exports.POST;
env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED = 'false'; assert.equal((await post(request())).status, 503);
env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED = 'true';
assert.equal((await post(request({ origin: 'https://elsewhere.example' }))).status, 403);
assert.equal((await post(request({ length: String(6 * 1024 * 1024) }))).status, 413);
viewer = null; assert.equal((await post(request())).status, 401); viewer = { id: 'owner' };
assert.equal((await post(request({ id: 'not-an-id' }))).status, 400);
assert.equal((await post(request({ file: new File(['wrong'], 'x.pdf', { type: 'application/pdf' }) }))).status, 400);
access = false; assert.equal((await post(request())).status, 403); assert.equal(uploads.length, 0);
access = true; accessError = { code: 'PGRST' }; assert.equal((await post(request())).status, 403); assert.equal(uploads.length, 0); accessError = null;
assert.equal((await post(request())).status, 200); assert.equal(uploads.length, 1);
assert.equal(uploads[0].path, `${paymentId}/comprovante`); assert.equal(uploads[0].options.upsert, false);
uploadError = { message: 'duplicate' }; assert.equal((await post(request())).status, 409);
console.log('PASS: upload gate, origin, size, authentication, signature, ownership and duplicate handling');
