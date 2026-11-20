import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseInstructorPublicProfile } from '../src/lib/instructor-public-profile.ts';

// Payload malformado nunca vira perfil.
for (const bad of [null, undefined, 'x', 1, {}, { id: 1, name: 'a' }]) assert.equal(parseInstructorPublicProfile(bad), null);
const ok = parseInstructorPublicProfile({
  id: 'i1', name: 'Ana', years_experience: 6, languages: ['Português', 3], beaches: ['Preá'], bio: 'Oi',
  rating_count: 2, rating_avg: 4.5,
  reviews: [{ stars: 9, comment: 'ótimo', created_at: '2026-11-01T10:00:00Z' }, { stars: 'x' }, null],
});
assert.deepEqual(ok.languages, ['Português'], 'ignora itens que não são texto');
assert.equal(ok.reviews.length, 1, 'descarta avaliação malformada');
assert.equal(ok.reviews[0].stars, 5, 'estrelas limitadas a 1-5');
assert.equal(parseInstructorPublicProfile({ id: 'i', name: 'B' }).rating_avg, null);

// A tela só abre pela reserva do próprio aluno e lê pela função do banco (sem tabela direta).
const page = readFileSync('src/app/aluno/(app)/reserva/[id]/instrutor/page.tsx', 'utf8');
assert.match(page, /requireRole\(\['student'\]/);
assert.match(page, /booking\.student_id !== viewer\.id/, 'a página confere o dono de novo');
const lib = readFileSync('src/lib/instructor-public-profile-server.ts', 'utf8');
assert.match(lib, /rpc\('get_instructor_public_profile'/);
assert.doesNotMatch(lib + page, /from\('(instructor_private_profiles|instructor_ratings|instructors)'\)/, 'sem leitura direta de tabela');
assert.match(readFileSync('src/app/aluno/(app)/reserva/[id]/page.tsx', 'utf8'), /\/instrutor`/, 'a reserva liga ao perfil');
console.log('PASS: perfil do instrutor lê só pela função do banco, a partir da reserva do aluno');
