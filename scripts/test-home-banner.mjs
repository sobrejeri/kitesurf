import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hero = readFileSync('src/components/student/home-poster-hero.tsx', 'utf8');
const home = readFileSync('src/app/aluno/(app)/inicio/page.tsx', 'utf8');
const search = readFileSync('src/components/student/lesson-search.tsx', 'utf8');
const css = readFileSync('src/app/aluno/(app)/mar-profundo.css', 'utf8');

assert.match(home, /<HomePosterHero firstName=\{firstName\} \/>/,
  'Explorar must render the campaign banner on the homepage');
assert.ok(!home.includes('<StudentHero'),
  'Do not leave the old plain home hero stacked above the new one');
for (const copy of ['Liberdade em cada rajada', 'Seu próximo', 'BORDO', 'começa aqui!',
  'Agende sua aula agora']) {
  assert.ok(hero.includes(copy), `Poster copy missing: ${copy}`);
}
assert.ok(hero.includes('href="#buscar-aula"'),
  'Hero CTA should jump to the existing booking form rather than submit a reservation');
assert.ok(search.includes('id="buscar-aula"') && search.includes('action="/aluno/reservar"'),
  'Search form must have the CTA anchor and preserve its real booking route');
assert.ok(hero.includes('alt=""') && hero.includes('aria-hidden="true"'),
  'Decorative image should not duplicate accessible headline');
assert.ok(hero.includes('aria-labelledby="vento-home-title"') &&
  hero.includes('id="vento-home-title"'),
  'Marketing banner must expose a meaningful accessible heading');
assert.equal((hero.match(/icon: '/g) ?? []).length, 4,
  'Show exactly four compact benefit icons');
assert.ok(css.includes('.vento-home-poster') && css.includes('@media (min-width: 768px)') &&
  css.includes('@media (max-width: 359px)'),
  'Poster must have mobile, desktop and very-narrow phone styling');
assert.ok(css.includes('#buscar-aula') && css.includes('scroll-margin-top'),
  'CTA target must not hide behind the floating student header');
console.log('PASS: high-impact hero and accessible scroll-to-book CTA are responsive');
