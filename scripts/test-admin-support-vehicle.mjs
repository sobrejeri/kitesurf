import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const requireNode = createRequire(import.meta.url);
const React = requireNode('react');
const { renderToStaticMarkup } = requireNode('react-dom/server');
const oldFlag = process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED;
let viewer = { role: 'admin', secondFactor: true };
let reads = 0;
let authChecks = 0;
let error = null;
let rows = [];
const queries = [];
function load(path, dependencies) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process, require(id) {
    if (id in dependencies) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  } });
  return exports;
}
const vehicle = load('../src/lib/instructor-support-vehicle.ts', {});
const box = ({ children }) => React.createElement('section', null, children);
const { AdminSupportVehiclePanel: Panel } = load('../src/components/admin/support-vehicle-panel.tsx', {
  'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
  '@/components/admin/kit': { Panel: box },
  '@/components/ui': { EmptyState: box, Note: box },
  '@/lib/auth': { async requireRole(roles, next) {
    authChecks++;
    assert.deepEqual([...roles], ['admin']);
    assert.equal(next, '/admin/transporte');
    return viewer;
  } },
  '@/lib/instructor-support-vehicle': vehicle,
  '@/lib/supabase/server': { async createSupabaseServerClient() {
    reads++;
    assert.equal(viewer.role, 'admin'); assert.equal(viewer.secondFactor, true);
    return { from(table) {
      assert.equal(table, 'instructor_support_vehicles');
      return {
        select(columns) { queries.push(columns); return this; },
        order(column, options) { assert.equal(column, 'instructor_id'); assert.equal(options.ascending, true); return this; },
        limit(amount) { assert.equal(amount, 500); return this; },
        async returns() { return { data: rows, error }; },
      };
    } };
  } },
  'react/jsx-runtime': requireNode('react/jsx-runtime'),
});
try {
  process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED = 'false';
  assert.equal(await Panel(), null);
  assert.equal(reads, 0); assert.equal(authChecks, 0);
  process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED = 'true';
  for (const forbidden of [{ role: 'instructor', secondFactor: true }, { role: 'admin', secondFactor: false }]) {
    viewer = forbidden;
    assert.equal(await Panel(), null);
  }
  assert.equal(reads, 0, 'role and AAL2 must be checked before creating a database client');
  viewer = { role: 'admin', secondFactor: true };
  let html = renderToStaticMarkup(await Panel());
  assert.match(html, /Nenhum veículo cadastrado/);
  for (const code of ['PGRST205', '42P01', '42501', 'NETWORK_ERROR']) {
    error = { code, message: 'private internal details' };
    html = renderToStaticMarkup(await Panel());
    assert.match(html, /temporariamente indisponíveis/);
    assert.doesNotMatch(html, /private|PGRST|42P01|42501/);
  }
  error = null;
  rows = [{ instructor_id: '00000000-0000-0000-0000-0000000000a1', vehicle_type: 'buggy',
    description: '<script>privateDriver()</script>', passenger_capacity: 3 }];
  html = renderToStaticMarkup(await Panel());
  assert.match(html, /Buggy/);
  assert.match(html, /3 passageiros/);
  assert.match(html, /sem contar o motorista/);
  assert.match(html, /href="\/admin\/instrutores\/00000000-0000-0000-0000-0000000000a1"/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<form|name="(?:price|capacity|hasSupportVehicle)"/);
  assert.ok(queries.every(columns => columns === 'instructor_id,vehicle_type,description,passenger_capacity'),
    'read exactly the metadata projection; never contact, document or driver PII');
  rows = Array.from({ length: 500 }, (_, i) => ({ instructor_id: String(i), vehicle_type: 'van', description: 'Van cinza', passenger_capacity: 1 }));
  html = renderToStaticMarkup(await Panel());
  assert.match(html, /Mostrando os primeiros 500 cadastros/);
  assert.match(html, /1 passageiro ·/);
  console.log('PASS: Admin vehicle metadata flag, role/AAL2, exact RLS projection, safe errors, escaped rendering and read-only bounded list (mock database)');
} finally {
  if (oldFlag === undefined) delete process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED;
  else process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED = oldFlag;
}
