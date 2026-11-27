import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const requireNode = createRequire(import.meta.url);
const calls = [];
const revalidated = [];
let role = 'instructor';
let error = null;
let clients = 0;
let row = null;
function load(path, dependencies) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process, require(id) {
    if (id in dependencies) return dependencies[id];
    throw new Error('Unexpected import: ' + id);
  } });
  return exports;
}
const vehicle = load('../src/lib/instructor-support-vehicle.ts', {});
const db = {
  async rpc(name, args) { calls.push({ name, args: JSON.parse(JSON.stringify(args)) }); return { error }; },
  from(table) {
    assert.equal(table, 'instructor_support_vehicles');
    return { select() { return this; }, eq(column, value) {
      assert.equal(column, 'instructor_id'); assert.equal(value, 'owner'); return this;
    }, async maybeSingle() { return { data: row, error }; } };
  },
};
const dependencies = {
  'next/cache': { revalidatePath(path) { revalidated.push(path); } },
  zod: requireNode('zod'),
  '@/lib/auth': { async requireRole(roles) { assert.deepEqual([...roles], ['instructor']); return { id: 'owner', role }; } },
  '@/lib/instructor-support-vehicle': vehicle,
  '@/lib/supabase/server': { async createSupabaseServerClient() { clients++; return db; } },
  './errors': { friendlyError() { return 'Não foi possível salvar.'; } },
};
const { saveInstructorSupportVehicle: save } = load('../src/app/actions/instructor-support-vehicle.ts', dependencies);
const form = (values = {}) => ({ get(key) {
  return ({ vehicleType: 'buggy', description: '  Buggy azul  ', passengerCapacity: '3', ...values })[key] ?? null;
} });
const oldFlag = process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED;
try {
  for (const flag of ['', 'false', 'TRUE', '1']) {
    process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED = flag;
    assert.equal(vehicle.supportVehicleProfileEnabled(), false);
    assert.ok((await save({}, form())).error);
  }
  assert.equal(clients, 0, 'disabled feature never creates a database client');
  process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED = 'true';
  for (const forbidden of ['admin', 'student', 'partner']) {
    role = forbidden;
    assert.ok((await save({}, form())).error);
  }
  assert.equal(clients, 0, 'admin role admitted by requireRole still cannot save owner metadata');
  role = 'instructor';
  for (const passengerCapacity of [null, '', '0', '21', '2.5', '1e1', '-1', '03', 'NaN']) {
    assert.ok((await save({}, form({ passengerCapacity }))).error);
  }
  for (const values of [{ vehicleType: 'boat' }, { description: ' ' }, { description: 'x'.repeat(81) }]) {
    assert.ok((await save({}, form(values))).error);
  }
  assert.equal(clients, 0, 'invalid fields fail before database access');
  assert.ok((await save({}, form({ instructorId: 'other', price: '1', hasSupportVehicle: 'true' }))).ok);
  assert.deepEqual(calls, [{ name: 'save_my_support_vehicle', args: {
    p_vehicle_type: 'buggy', p_description: 'Buggy azul', p_passenger_capacity: 3,
  } }], 'forged owner, rate and eligibility are never sent');
  assert.deepEqual(revalidated, ['/instrutor/cadastro']);
  for (const code of ['42P01', 'PGRST202', 'PGRST204', 'PGRST205']) {
    error = { code, message: 'internal schema details' };
    const result = await save({}, form());
    assert.match(result.error, /ainda não está disponível/);
    assert.ok(!result.error.includes('internal'));
  }
  assert.equal(revalidated.length, 1, 'failed saves cannot report success or invalidate other flows');

  // Execute the actual async panel: off performs no read; missing schema has no form.
  const React = requireNode('react');
  const { renderToStaticMarkup } = requireNode('react-dom/server');
  const box = ({ children }) => React.createElement('div', null, children);
  const { InstructorSupportVehiclePanel: Panel } = load('../src/components/instructor/support-vehicle-panel.tsx', {
    '@/app/actions/instructor-support-vehicle': { saveInstructorSupportVehicle: save },
    '@/components/action-form': { ActionForm: ({ children }) => React.createElement('form', null, children) },
    '@/components/ui': { Card: box, Field: box, Note: box, inputClass: '' },
    '@/lib/instructor-support-vehicle': vehicle,
    '@/lib/supabase/server': dependencies['@/lib/supabase/server'],
    'react/jsx-runtime': requireNode('react/jsx-runtime'),
  });
  process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED = 'false';
  const before = clients;
  assert.equal(await Panel({ instructorId: 'owner' }), null);
  assert.equal(clients, before);
  process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED = 'true';
  let html = renderToStaticMarkup(await Panel({ instructorId: 'owner' }));
  assert.match(html, /ainda não está disponível/);
  assert.doesNotMatch(html, /<form/);
  error = null;
  row = { vehicle_type: 'buggy', description: 'Buggy azul', passenger_capacity: 3 };
  html = renderToStaticMarkup(await Panel({ instructorId: 'owner' }));
  assert.match(html, /3 passageiro/);
  assert.match(html, /name="passengerCapacity"/);
  assert.doesNotMatch(html, /name="(?:instructorId|price|hasSupportVehicle)"/);
  console.log('PASS: vehicle feature gate, owner role, validated action, forged fields, schema fallback and panel rendering (mock database)');
} finally {
  if (oldFlag === undefined) delete process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED;
  else process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED = oldFlag;
}
