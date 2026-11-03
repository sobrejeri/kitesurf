import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const hero = readFileSync('src/components/student/home-poster-hero.tsx', 'utf8');
const home = readFileSync('src/app/aluno/(app)/inicio/page.tsx', 'utf8');
const search = readFileSync('src/components/student/lesson-search.tsx', 'utf8');
const css = readFileSync('src/app/aluno/(app)/mar-profundo.css', 'utf8');

assert.match(home, /<HomePosterHero firstName=\{firstName\} \/>/,
  'Explorar must render the campaign banner on the homepage');
assert.ok(!home.includes('<StudentHero'),
  'Do not leave the old plain home hero stacked above the new one');
for (const copy of ['Liberdade em cada rajada', 'Seu próximo', 'BORDO', 'começa aqui!']) {
  assert.ok(hero.includes(copy), `Poster copy missing: ${copy}`);
}
assert.ok(!hero.includes('vento-home-poster-cta') && !hero.includes('Agende sua aula agora'),
  'A compact hero must not repeat the booking form with an orange CTA');
assert.ok(hero.includes('vento-home-poster-titleline'),
  'The headline should group BORDO and the script tagline in a compact layout');
assert.ok(search.includes('id="buscar-aula"') && search.includes('action="/aluno/reservar"'),
  'Search form should remain directly under the hero and preserve its booking route');
assert.ok(hero.includes('alt=""') && hero.includes('aria-hidden="true"'),
  'Decorative image should not duplicate accessible headline');
assert.ok(hero.includes('src="/images/kite-lesson.webp"'),
  'Hero must use the existing high-resolution local kite lesson photo');
assert.ok(!hero.includes('src="/images/mar-profundo-kite.webp"'),
  'Do not regress to the tiny, pixelated 3.8 KB background');
assert.ok(statSync('public/images/kite-lesson.webp').size > 100_000,
  'The hero photo should be a proper high-detail asset, not a thumbnail');
assert.ok(hero.includes('width={1254}') && hero.includes('height={1254}')
  && hero.includes('fetchPriority="high"'),
  'The visible hero photo needs explicit image dimensions and eager loading');
assert.ok(!css.includes('filter: saturate(1.65) contrast(1.15) brightness(1.04)'),
  'Avoid overly strong image processing that degrades the new photograph');
assert.ok(hero.includes('aria-labelledby="vento-home-title"') &&
  hero.includes('id="vento-home-title"'),
  'Marketing banner must expose a meaningful accessible heading');
assert.equal((hero.match(/icon: '/g) ?? []).length, 4,
  'Show exactly four compact benefit icons');
assert.ok(css.includes('.vento-home-poster') && css.includes('@media (min-width: 768px)') &&
  css.includes('@media (max-width: 359px)'),
  'Poster must have mobile, desktop and very-narrow phone styling');
assert.ok(css.includes('padding: calc(env(safe-area-inset-top) + 82px) 18px 37px;'),
  'The hero should have reduced mobile spacing so the booking fields appear sooner');
assert.ok(css.includes('.vento-home-poster-wave') && css.includes('height: 25px;'),
  'The mobile wave separator should be compact');
assert.ok(!css.includes('.vento-home-poster-cta'),
  'The duplicate orange CTA styling must be removed');
console.log('PASS: compact responsive hero without redundant CTA; booking form preserved');
