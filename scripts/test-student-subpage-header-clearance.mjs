import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// On phones the student app bar (back arrow, compact logo and menu) floats
// over the top 64px of every page plus the safe area. A secondary page must
// therefore either open with the photo StudentHero, which pads itself below
// the bar, or wrap its content in the shared clearance class. Otherwise the
// eyebrow and the title are drawn under the logo and the back button, as
// reproduced on iPhone width for Atendimento, Avisos, Ocorrências, the
// instructor search request and the booking chat.
const ROOT = 'src/app/aluno/(app)';
const SECONDARY_PAGES = [
  'central',
  'politicas',
  'avisos',
  'atendimento',
  'atendimento/[id]',
  'ocorrencias',
  'solicitacao/[id]',
  'reserva/[id]',
];
const CLEARANCE = 'vento-mobile-appbar-clearance';

const missing = [];
for (const page of SECONDARY_PAGES) {
  const source = readFileSync(`${ROOT}/${page}/page.tsx`, 'utf8');
  const photoHero = /<StudentHero\b(?![^>]*\bplainOnMobile\b)/.test(source);
  const cleared = new RegExp(`className="[^"]*\\b${CLEARANCE}\\b[^"]*"`).test(source);
  if (!photoHero && !cleared) missing.push(page);
}
assert.deepEqual(missing, [],
  `Secondary student pages drawn under the floating phone app bar: ${missing.join(', ')}`);

// The clearance must apply only below md (the bar is md:hidden) and must
// include the iPhone safe area, like the bar's own pt-safe padding.
const css = readFileSync(`${ROOT}/mar-profundo.css`, 'utf8');
const rule = css.match(/@media\s*\(max-width:\s*767\.98px\)\s*\{\s*\.vento-mobile-appbar-clearance\s*\{([^}]*)\}/);
assert.ok(rule, 'Clearance rule must exist and be limited to phones');
assert.match(rule[1], /padding-top:\s*calc\(env\(safe-area-inset-top\)\s*\+\s*\d+px\)/,
  'Clearance must add the safe area to the app bar height');
const clearPx = Number(rule[1].match(/\+\s*(\d+)px/)[1]);
assert.ok(clearPx >= 64, `Clearance (${clearPx}px) must not be shorter than the 64px app bar`);

// The bar really is 64px tall and hidden from md up; keep the two in sync.
const shell = readFileSync('src/components/shells.tsx', 'utf8');
assert.match(shell, /pointer-events-none pt-safe absolute inset-x-0 top-0 z-30 md:hidden">\s*<div className="flex h-16 items-center/,
  'Floating phone app bar height changed: update the clearance rule too');

console.log('PASS: secondary student pages start below the floating phone app bar');
