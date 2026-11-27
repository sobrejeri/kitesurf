import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
let role = 'instructor', row = null, dbError = null, rpcError = null, clients = 0;
const calls = [], filters = [], revalidated = [];
const db = {
  from(name) { assert.equal(name, 'company_instructor_payments'); return {
    select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
    async maybeSingle() { return { data: row, error: dbError }; },
  }; },
  async rpc(name, args) { calls.push([name, args.p_payment]); return { error: rpcError }; },
};
const imports = {
  'next/cache': { revalidatePath(p) { revalidated.push(p); } },
  zod: nodeRequire('zod'),
  '@/lib/auth': { async requireRole() { return { id: 'instructor-owner', role }; } },
  '@/lib/supabase/server': { async createSupabaseServerClient() { clients++; return db; } },
};
const source = readFileSync(new URL('../src/app/actions/instructor-company-payments.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, process, require(id) { if (id in imports) return imports[id]; throw new Error(id); } });
const confirm = exports.confirmCompanyPayment;
const id = 'eab9ab2a-dde1-40f2-9be5-559f8b96ee56';
const form = (values = {}) => ({ get(k) { return ({ paymentId: id, acknowledge: 'yes', ...values })[k] ?? null; } });
const previous = process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED;
const previousReceipts = process.env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED;
try {
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED = 'false';
  assert.ok((await confirm({}, form())).error); assert.equal(clients, 0);
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED = 'true';
  role = 'admin'; assert.ok((await confirm({}, form())).error); assert.equal(clients, 0);
  role = 'instructor';
  for (const value of [{ paymentId: 'invalid' }, { acknowledge: null }]) assert.ok((await confirm({}, form(value))).error);
  assert.equal(clients, 0);
  assert.ok((await confirm({}, form())).error); assert.deepEqual(filters, [['id', id], ['instructor_id', 'instructor-owner']]);
  assert.equal(calls.length, 0, 'another owner or missing record cannot reach the RPC');
  row = { id, instructor_id: 'other', confirmed_at: null, voided_at: null };
  assert.ok((await confirm({}, form())).error); assert.equal(calls.length, 0, 'a mismatched owner is rejected even if returned');
  row = { id, instructor_id: 'instructor-owner', confirmed_at: '2026-01-01', voided_at: null };
  assert.ok((await confirm({}, form())).error); assert.equal(calls.length, 0);
  row = { id, instructor_id: 'instructor-owner', confirmed_at: null, voided_at: '2026-01-01' };
  assert.ok((await confirm({}, form())).error); assert.equal(calls.length, 0);
  row = { id, instructor_id: 'instructor-owner', confirmed_at: null, voided_at: null }; rpcError = { message: 'private database details' };
  const failure = await confirm({}, form()); assert.ok(failure.error); assert.ok(!failure.error.includes('private'));
  assert.equal(revalidated.length, 0);
  rpcError = null;
  assert.ok((await confirm({}, form())).ok);
  assert.deepEqual(calls.at(-1), ['confirm_instructor_payment', id]);
  assert.deepEqual(revalidated, ['/instrutor/financeiro/recebimentos']);
  const React = nodeRequire('react');
  const render = nodeRequire('react-dom/server').renderToStaticMarkup;
  let pageRows = [], listError = null;
  const pageDb = { async rpc(name) { assert.equal(name, 'my_company_earnings'); return { data: [{ link_id: 'link', company_id: 'company', company_name: 'Escola teste' }], error: null }; }, from(name) { assert.equal(name, 'company_instructor_payments'); return {
    select() { return this; }, eq(key, value) { assert.equal(key, 'instructor_id'); assert.equal(value, 'instructor-owner'); return this; },
    order() { return this; }, async limit() { return { data: pageRows, error: listError }; },
  }; } };
  const box = ({ children }) => React.createElement('div', null, children);
  const componentExports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/components/payment-receipt-download.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: componentExports, encodeURIComponent, require(id) {
    if (id === 'react/jsx-runtime') return nodeRequire(id); throw Error(id);
  } });
  const pageImports = {
    'react/jsx-runtime': nodeRequire('react/jsx-runtime'),
    'next/link': { default: box },
    '@/components/admin/kit': { AdminTitle: box, Panel: box },
    '@/components/action-form': { ActionForm: box },
    '@/components/ui': { EmptyState: box, Note: box },
    '@/components/payment-receipt-download': componentExports,
    '@/lib/business/payment-receipt-feature': { businessReceiptsEnabled() { return process.env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED === 'true'; } },
    '@/app/actions/instructor-company-payments': { confirmCompanyPayment: confirm },
    '@/lib/auth': imports['@/lib/auth'],
    '@/lib/format': { formatMoney: (n) => String(n) },
    '@/lib/supabase/server': { async createSupabaseServerClient() { clients++; return pageDb; } },
  };
  const pageSource = readFileSync(new URL('../src/app/instrutor/(app)/financeiro/recebimentos/page.tsx', import.meta.url), 'utf8');
  const pageCode = ts.transpileModule(pageSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const pageExports = {};
  vm.runInNewContext(pageCode, { exports: pageExports, process, require(id) { if (id in pageImports) return pageImports[id]; throw new Error(id); } });
  const page = pageExports.default;
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED = 'false';
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED = 'true';
  const before = clients; assert.match(render(await page()), /ainda não estão disponíveis/); assert.equal(clients, before);
  assert.doesNotMatch(render(await page()), /Baixar comprovante/);
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED = 'true';
  pageRows = [{ id, instructor_id: 'other', cents: 500, method: 'pix', paid_on: '2026-11-27', reference: 'outro-dado-privado' }];
  const hidden = render(await page()); assert.match(hidden, /Não foi possível carregar/); assert.doesNotMatch(hidden, /outro-dado-privado/);
  assert.doesNotMatch(hidden, /payment-receipt|Baixar comprovante/);
  pageRows = [{ id, instructor_id: 'instructor-owner', link_id: 'link', company_id: 'company', cents: 500, method: 'pix', paid_on: '2026-11-27', reference: 'ref-teste', confirmed_at: null, voided_at: null }];
  const shown = render(await page()); assert.match(shown, /ref-teste/); assert.match(shown, /Escola teste/); assert.match(shown, /Confirmo que recebi/);
  assert.match(shown, new RegExp(`href="/api/business/payment-receipt\\?area=instrutor&amp;paymentId=${id}"`));
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED = 'false'; assert.doesNotMatch(render(await page()), /payment-receipt|Baixar comprovante/);
  process.env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED = 'true';
  pageRows[0].company_id = 'other'; const wrongCompany = render(await page()); assert.match(wrongCompany, /Não foi possível carregar/); assert.doesNotMatch(wrongCompany, /payment-receipt|Baixar comprovante/);
  role = 'admin'; const beforeAdmin = clients; assert.match(render(await page()), /próprio instrutor/); assert.equal(clients, beforeAdmin);
  console.log('PASS: disabled and foreign-owner page fail closed; own pending payment rendered (mock database)');
  console.log('PASS: feature gate, owner, explicit acknowledgment, final states and RPC failures (mock database)');
} finally {
  if (previous === undefined) delete process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED;
  else process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED = previous;
  if (previousReceipts === undefined) delete process.env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED;
  else process.env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED = previousReceipts;
}
