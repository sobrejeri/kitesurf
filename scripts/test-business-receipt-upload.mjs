import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync('src/app/api/business/payment-receipt/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
let viewer = { id: 'owner' }, access = true, accessError = null, uploadError = null, downloadError = null;
let uploads = [];
let downloads = 0, lastWrite, selectedArea, downloadFile = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
const bucket = { async upload(path, file, options) { uploads.push({ path, file, options }); return { error: uploadError }; },
  async download() { downloads++; return { data: downloadError ? null : downloadFile, error: downloadError }; } };
const db = { async rpc(name, args) { assert.equal(name, 'business_payment_receipt_access'); lastWrite = args.p_write; return { data: access, error: accessError }; },
  auth: { async getClaims() { return { data: viewer ? { claims: { sub: viewer.id } } : null, error: null }; } },
  storage: { from(name) { assert.equal(name, 'vento-business-payment-receipts'); return bucket; } } };
const env = { NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED: 'true' };
const deps = {
  'next/server': { NextResponse: { json(body, init = {}) { return { body, status: init.status ?? 200 }; } } },
  '@/lib/app-areas': { isArea(area) { return ['aluno', 'instrutor', 'admin', 'afiliado'].includes(area); } },
  '@/lib/business/payment-receipt-feature': { businessReceiptsEnabled() { return env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED === 'true'; } },
  '@/lib/supabase/server': { async createSupabaseServerClient(area) { selectedArea = area; return db; } },
};
vm.runInNewContext(code, { module, exports: module.exports, require(id) { if (!(id in deps)) throw Error(id); return deps[id]; },
  process: { env }, URL, File, Uint8Array, Number, Response });
const paymentId = '11111111-1111-4111-8111-111111111111';
const pdf = new File(['%PDF-1.7'], 'receipt.pdf', { type: 'application/pdf' });
function request({ origin = 'https://vento.example', host = 'vento.example', length = '200', id = paymentId, file = pdf } = {}) {
  const headers = new Headers({ origin, host });
  if (length !== null) headers.set('content-length', length);
  const data = new FormData(); data.set('paymentId', id); data.set('file', file);
  return new Request('https://vento.example/api/business/payment-receipt?area=aluno', { method: 'POST', headers, body: data });
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
assert.equal(lastWrite, true);
assert.equal(selectedArea, 'aluno');
assert.equal(uploads[0].path, `${paymentId}/comprovante`); assert.equal(uploads[0].options.upsert, false);
uploadError = { message: 'duplicate' }; assert.equal((await post(request())).status, 409);
uploadError = null;
assert.equal((await post(request({ length: null }))).status, 200, 'legal multipart without Content-Length is accepted');
for (const declaredLength of [null, '1']) {
  let cancelled = false;
  const headers = new Headers({ origin: 'https://vento.example', host: 'vento.example', 'content-type': 'multipart/form-data; boundary=test' });
  if (declaredLength !== null) headers.set('content-length', declaredLength);
  const tooLarge = new Request('https://vento.example/api/business/payment-receipt?area=aluno', { method: 'POST', headers,
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 64 * 1024 + 1)); }, cancel() { cancelled = true; } }), duplex: 'half' });
  const previousUploads = uploads.length;
  assert.equal((await post(tooLarge)).status, 413, 'actual body limit applies even without an accurate header');
  assert.equal(uploads.length, previousUploads); assert.equal(cancelled, true);
}
const get = module.exports.GET;
const getRequest = { url: `https://vento.example/api/business/payment-receipt?area=instrutor&paymentId=${paymentId}` };
env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED = 'false'; assert.equal((await get(getRequest)).status, 503);
env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED = 'true';
assert.equal((await get({ url: 'https://vento.example/api/business/payment-receipt?paymentId=invalid' })).status, 404);
viewer = null; assert.equal((await get(getRequest)).status, 401); viewer = { id: 'owner' };
access = false; assert.equal((await get(getRequest)).status, 404); assert.equal(downloads, 0);
access = true; downloadError = { message: 'not found' }; assert.equal((await get(getRequest)).status, 404);
downloadError = null; const response = await get(getRequest);
assert.equal(response.status, 200); assert.equal(lastWrite, false);
assert.equal(selectedArea, 'instrutor');
assert.equal(response.headers.get('content-disposition'), 'attachment; filename="comprovante.pdf"');
assert.equal(response.headers.get('content-type'), 'application/octet-stream');
assert.match(response.headers.get('cache-control'), /no-store/);
assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
assert.equal(await response.text(), '%PDF-1.7');
downloadFile = new Blob(['wrong'], { type: 'application/pdf' }); assert.equal((await get(getRequest)).status, 404);
console.log('PASS: receipt upload and private download gates, access control, content checks and safe response headers');
