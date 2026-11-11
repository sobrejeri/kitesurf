import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { formatTaxId, isValidTaxId, normalizeTaxId, taxIdKind } from '../src/lib/tax-id.ts';
import { parsePartnerProgress, partnerCompletion, partnerRequired } from '../src/lib/partner-progress.ts';
import { computeInstructorCompletion, readProgressFlags } from '../src/lib/instructor-completion.ts';

// CPF or CNPJ for instructors and affiliates (migration 47). Sign-in stays
// e-mail; the document is private registration data required for approval.
const read = (path) => readFileSync(path, 'utf8');

// 1. Same rules as public.tax_id_is_valid (numbers checked independently).
for (const valid of ['52998224725', '11144477735', '39053344705', '12345678909', '11222333000181', '11444777000161', '12ABC34501DE35']) {
  assert.ok(isValidTaxId(valid), `${valid} is valid`);
}
for (const invalid of ['52998224724', '11111111111', '00000000000', '11222333000182', '00000000000000', '12ABC34501DE36', '123', '']) {
  assert.ok(!isValidTaxId(invalid), `${invalid} is invalid`);
}
assert.equal(normalizeTaxId(' 529.982.247-25 '), '52998224725');
assert.equal(normalizeTaxId('12.abc.345/01de-35'), '12ABC34501DE35', 'letters of the new CNPJ in upper case');
assert.equal(taxIdKind('52998224725'), 'cpf');
assert.equal(taxIdKind('12ABC34501DE35'), 'cnpj');
assert.equal(taxIdKind('1234'), null);
assert.equal(formatTaxId('52998224725'), '529.982.247-25');
assert.equal(formatTaxId('11222333000181'), '11.222.333/0001-81');
assert.equal(formatTaxId('12ABC34501DE35'), '12.ABC.345/01DE-35');

// 2. Completion lists: the document counts only when the database tracks it,
// so pages keep working before migration 47 is applied.
const partnerBase = { name: true, beach: true, responsible: true, phone: true, city: true, address: true, instagram: false, avatar: false, payout: false };
const before = parsePartnerProgress(partnerBase);
assert.ok(before && !('taxId' in before), 'old database: no taxId flag');
assert.equal(partnerRequired(before).length, 6);
assert.ok(partnerCompletion(before).ready, 'old database: ready without the document');
const missing = parsePartnerProgress({ ...partnerBase, taxId: false });
assert.equal(partnerRequired(missing).length, 7, 'document becomes essential');
assert.ok(!partnerCompletion(missing).ready, 'not ready without the document');
assert.equal(partnerCompletion(missing).requiredTotal, 7);
assert.ok(partnerCompletion(parsePartnerProgress({ ...partnerBase, taxId: true })).ready);
assert.equal(parsePartnerProgress({ ...partnerBase, taxId: 'yes' })?.taxId, undefined, 'only a boolean flag counts');

const teacher = { fullName: true, photo: true, phone: true, city: true, bio: true, beaches: true, languages: true, experience: true, equipment: false, supportVehicle: false, payout: true };
const docs = [{ kind: 'identity', status: 'approved' }, { kind: 'certification', status: 'approved' }];
assert.ok(computeInstructorCompletion(readProgressFlags(teacher), docs).readyForApproval, 'old database: ready');
const noDoc = computeInstructorCompletion(readProgressFlags({ ...teacher, taxId: false }), docs);
assert.ok(!noDoc.readyForApproval && noDoc.required.some((item) => item.key === 'taxId' && item.state === 'missing'),
  'instructor without CPF/CNPJ is not ready');
assert.ok(computeInstructorCompletion(readProgressFlags({ ...teacher, taxId: true }), docs).readyForApproval);

// 3. Database: private table, writes only through checked functions, audited without the number.
const migration = read('supabase/migrations/20261111140000_registration_47_account_tax_ids.sql');
assert.match(migration, /alter table public\.account_tax_ids enable row level security/);
assert.match(migration, /revoke all on public\.account_tax_ids from public, anon, authenticated;\s*grant select on public\.account_tax_ids to authenticated;/,
  'clients may only read (their own row, by policy)');
assert.match(migration, /using \(id = \(select auth\.uid\(\)\) or public\.is_admin\(\)\)/, 'holder or admin');
assert.match(migration, /unique \(account_role, number\)/, 'one document per account of each kind');
assert.match(migration, /set_my_tax_id[\s\S]*security definer[\s\S]*require_role\(array\['instructor', 'partner'\]/);
assert.match(migration, /admin_set_tax_id[\s\S]*require_role\(array\['admin'\]/);
assert.match(migration, /Instructor CPF or CNPJ is required before activation/);
assert.match(migration, /Partner CPF or CNPJ is required before approval/);
assert.doesNotMatch(migration, /write_audit\([^;]*'number'/, 'audit stores the kind, never the number');
assert.match(read('supabase/tests/99zzzzzzzzzzz_account_tax_ids.test.sql'), /PASS: CPF\/CNPJ/);

// 4. App: actions, pages and messages.
const actions = read('src/app/actions/tax-id.ts');
assert.ok(actions.startsWith("'use server'") && actions.includes('z.strictObject'), 'validated server actions');
assert.ok(actions.includes("rpc('set_my_tax_id'") && actions.includes("rpc('admin_set_tax_id'"));
for (const line of actions.split('\n').filter((l) => l.includes('console.'))) {
  assert.match(line, /\{ code: error\.code \}/, 'only the error code is logged, never the number');
}
assert.ok(read('src/app/instrutor/(app)/cadastro/page.tsx').includes('<TaxIdBody state={taxId} />'), 'instructor profile asks for it');
assert.ok(read('src/app/afiliado/(app)/perfil/page.tsx').includes('<TaxIdBody state={taxId}/>'), 'affiliate profile asks for it');
assert.ok(read('src/app/admin/(app)/instrutores/[id]/page.tsx').includes('<AdminTaxIdCorrection profileId={row.id} state={taxId} />'));
assert.ok(read('src/app/admin/(app)/afiliados/[id]/page.tsx').includes('<AdminTaxIdCorrection profileId={ownerId} state={taxId}/>'));
const panel = read('src/components/tax-id-panel.tsx');
assert.doesNotMatch(panel.slice(panel.indexOf('export function taxIdSummary'), panel.indexOf('export function TaxIdBody')), /formatTaxId/,
  'the collapsed summary never shows the number');
const errors = read('src/app/actions/errors.ts');
for (const pattern of ['Invalid CPF or CNPJ', 'account_tax_ids_one_per_role', 'Approved CPF or CNPJ changes require admin review', 'CPF or CNPJ is required before']) {
  assert.ok(errors.includes(pattern), `friendly message for ${pattern}`);
}
assert.match(read('src/app/actions/admin.ts'), /if\(flags\.taxId===false\)missing\.push\(PROFILE_TAX_ID\.label\)/);

console.log('PASS: CPF/CNPJ validated like the database, private, required for approval, optional until migration 47 is applied');
