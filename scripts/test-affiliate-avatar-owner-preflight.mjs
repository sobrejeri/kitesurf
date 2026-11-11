import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/app/actions/partner-profile.ts', 'utf8');
const legacy = source.split('export async function uploadPartnerAvatar(')[1]?.split('export async function preparePartnerAvatarUpload(')[0];
const signed = source.split('export async function preparePartnerAvatarUpload(')[1]?.split('export async function registerPartnerAvatarUpload(')[0];
assert.ok(legacy && signed, 'Both avatar upload entrypoints must exist');
for (const [name, action] of [['legacy', legacy], ['signed', signed]]) {
  assert.match(action, /from\('partners'\)[\s\S]*?eq\('owner_id',\s*viewer\.id\)/, name + ' must check owner-scoped partner record');
  assert.match(action, /if\s*\(partnerError\s*\|\|\s*!partner\)/, name + ' must reject missing partner');
}
assert.ok(legacy.indexOf("from('partners')") < legacy.indexOf('.upload(path,bytes'), 'Legacy upload must check partner before writing to Storage');
console.log('PASS: both affiliate avatar upload paths require partner ownership before Storage writes');
