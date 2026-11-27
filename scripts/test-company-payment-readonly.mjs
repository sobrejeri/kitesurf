import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const requireNode = createRequire(import.meta.url);
function load(path, deps) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { exports, process, encodeURIComponent, require(name) {
    if (name in deps) return deps[name]; throw Error(name);
  } }); return exports;
}
const companyId = '11111111-1111-4111-8111-111111111111';
const foreignId = '22222222-2222-4222-8222-222222222222';
const paymentId = '33333333-3333-4333-8333-333333333333';
let viewer = { id: 'owner', role: 'student', secondFactor: false };
let workspace = { kind: 'ready', companies: [{ id: companyId, name: 'Escola própria', access: 'owner' }] };
let permission = true, permissionError = null, dbError = null, clients = 0, calls = [], queries = [];
let rows = [{ id: paymentId, company_id: companyId, cents: 15000, method: 'pix', reference: 'REF-TESTE', paid_on: '2026-11-27', confirmed_at: null, voided_at: null }];
const row = structuredClone(rows[0]);
const db = { async rpc(name, args) { calls.push({ name, args }); return { data: permission, error: permissionError }; },
  from(table) { const q = { table, filters: [] }; queries.push(q); return {
    select(columns) { q.columns = columns; return this; }, eq(key, value) { q.filters.push([key, value]); return this; },
    order() { return this; }, limit(value) { q.limit = value; return this; }, async returns() { return { data: rows, error: dbError }; },
  }; } };
const deps = { 'server-only': {}, '@/lib/auth': { async getViewer() { return viewer; } },
  '@/lib/business/core-feature': { businessCoreEnabled() { return process.env.NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED === 'true'; } },
  '@/lib/business/core-data': { async readCompanyWorkspace() { return workspace; } },
  '@/lib/supabase/server': { async createSupabaseServerClient() { clients++; return db; } } };
const read = load('src/lib/company-payment-data.ts', deps).readCompanyPayments;
const flags = ['NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED', 'NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED'];
const previous = flags.map(key => process.env[key]);
try {
  for (const disabled of flags) {
    for (const key of flags) process.env[key] = key === disabled ? 'false' : 'true';
    assert.equal((await read(companyId)).kind, 'disabled'); assert.equal(clients, 0);
  }
  for (const key of flags) process.env[key] = 'true';
  assert.equal((await read('invalid')).kind, 'denied'); assert.equal(clients, 0);
  viewer = null; assert.equal((await read(companyId)).kind, 'denied');
  viewer = { id: 'admin', role: 'admin', secondFactor: false }; assert.equal((await read(companyId)).kind, 'denied'); assert.equal(clients, 0);
  viewer = { id: 'owner', role: 'student', secondFactor: false };
  let result = await read(companyId); assert.equal(result.kind, 'ready'); assert.equal(result.companyName, 'Escola própria');
  assert.equal(result.payments[0].cents, 15000); assert.equal(result.payments[0].status, 'pending');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { name: 'company_any_permission', args: { p_company: companyId, p_permission: 'finance.reports' } });
  assert.deepEqual(queries[0].filters, [['company_id', companyId]]); assert.equal(queries[0].limit, 101);
  assert.ok(!queries[0].columns.includes('*')); assert.ok(!JSON.stringify(result).includes('company_id'));
  const beforeForeign = clients;
  workspace = { kind: 'ready', companies: [{ id: foreignId, name: 'Outra escola', access: 'member' }] };
  assert.equal((await read(companyId)).kind, 'denied'); assert.equal(clients, beforeForeign, 'foreign membership never queries payments');
  workspace = { kind: 'ready', companies: [{ id: companyId, name: 'Minha equipe', access: 'member' }] };
  permission = false; assert.equal((await read(companyId)).kind, 'denied');
  permission = true; assert.equal((await read(companyId)).kind, 'ready', 'financial member may read');
  permissionError = { message: 'private schema details' }; assert.equal((await read(companyId)).kind, 'unavailable'); permissionError = null;
  rows = [{ ...row, company_id: foreignId }]; result = await read(companyId); assert.equal(result.kind, 'unavailable'); assert.ok(!JSON.stringify(result).includes('REF-TESTE'));
  rows = Array.from({ length: 101 }, () => row); result = await read(companyId); assert.equal(result.hasMore, true); assert.equal(result.payments.length, 100);
  rows = [row]; viewer = { id: 'admin', role: 'admin', secondFactor: true }; const beforeAdmin = calls.length;
  assert.equal((await read(companyId)).kind, 'ready'); assert.equal(calls.length, beforeAdmin, 'AAL2 admin uses RLS admin access');
  dbError = { message: 'private details' }; assert.equal((await read(companyId)).kind, 'unavailable'); dbError = null;

  const React = requireNode('react');
  const render = requireNode('react-dom/server').renderToStaticMarkup;
  const box = ({ children }) => React.createElement('div', null, children);
  const jsx = requireNode('react/jsx-runtime');
  const download = load('src/components/payment-receipt-download.tsx', { 'react/jsx-runtime': jsx });
  let receipts = false;
  const Panel = load('src/components/company-payment-list.tsx', {
    'react/jsx-runtime': jsx, '@/components/ui': { Card: box, Note: box },
    '@/components/payment-receipt-download': download, '@/lib/company-payment-data': { readCompanyPayments: read },
    '@/lib/business/payment-receipt-feature': { businessReceiptsEnabled() { return receipts; } },
    '@/lib/format': { formatMoney: cents => String(cents) },
  }).CompanyPaymentList;
  let html = render(await Panel({ companyId, area: 'aluno' })); assert.match(html, /REF-TESTE/); assert.doesNotMatch(html, /payment-receipt/);
  receipts = true; html = render(await Panel({ companyId, area: 'aluno' }));
  assert.match(html, new RegExp(`area=aluno&amp;paymentId=${paymentId}`));
  workspace = { kind: 'ready', companies: [] }; html = render(await Panel({ companyId, area: 'aluno' }));
  assert.doesNotMatch(html, /REF-TESTE|payment-receipt|15000/); assert.match(html, /não tem acesso financeiro/);

  // Execute area wrappers: their session role and download area must agree.
  for (const [area, role, segment] of [['aluno', 'student', 'empresa'], ['instrutor', 'instructor', 'empresa'], ['afiliado', 'partner', 'empresa'], ['admin', 'admin', 'empresas']]) {
    const roles = [];
    const Page = load(`src/app/${area}/(app)/${segment}/[companyId]/pagamentos/page.tsx`, {
      'react/jsx-runtime': requireNode('react/jsx-runtime'), '@/lib/auth': { async requireRole(values) { roles.push(...values); } },
      '@/components/company-payment-list': { CompanyPaymentList() {} },
    }).default;
    const element = await Page({ params: Promise.resolve({ companyId }) });
    assert.deepEqual(roles, [role]); assert.equal(element.props.area, area); assert.equal(element.props.companyId, companyId);
  }
  console.log('PASS: read-only company payments flags, owner/member scope, foreign company, financial permission, Admin AAL2 and area sessions (mock DB)');
} finally { flags.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
