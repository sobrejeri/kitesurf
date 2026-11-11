import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Admin, Instructor and Afiliado phone headers show the official logo with the
// area label under it (StudentBrand). Reproduced at 390px: that brand is about
// 70px tall, but the header row was fixed at h-14 (56px) and centred, so the
// logo started 7px above the top of the screen (clipped, or under the status
// bar in the PWA) and the "ADMIN" / "INSTRUTOR" / "AFILIADO" label sat on the
// header's bottom border.
const css = readFileSync('src/app/globals.css', 'utf8');
const sunset = readFileSync('src/components/student/sunset.tsx', 'utf8');
const mobile = readFileSync('src/components/mobile.tsx', 'utf8');
const shells = readFileSync('src/components/shells.tsx', 'utf8');

// Height the brand needs on a 390px phone, from the real CSS values.
const phoneWidth = 390;
const cap = Number(css.match(/\.vento-official-logo--compact \{ width: min\(48vw, (\d+)px\); \}/)?.[1]);
const [ratioW, ratioH] = (css.match(/aspect-ratio: (\d+) \/ (\d+);/)?.slice(1) ?? []).map(Number);
assert.ok(cap && ratioW && ratioH, 'Official logo phone size and aspect ratio must be declared');
const logoHeight = Math.min(phoneWidth * 0.48, cap) * ratioH / ratioW;
assert.match(sunset, /<span className="inline-flex min-w-0 flex-col items-start gap-1">\s*<OfficialLogo compact \/>/,
  'StudentBrand stacks the compact logo over the area label');
assert.match(sunset, /pl-1 text-\[10px\] font-semibold uppercase/, 'Area label is 10px text');
const brandHeight = logoHeight + 4 /* gap-1 */ + 10 * 1.5 /* label line box */;
assert.ok(brandHeight > 56, `Brand height (${brandHeight.toFixed(1)}px) exceeds a 56px row`);

// The brand really is the leading content of the affected headers.
assert.match(shells, /<MobileHeader\s+breakpoint="lg"\s+leading=\{<StudentBrand subtitle=\{brandSubtitle\} \/>\}/,
  'Admin/Instructor sunset header uses StudentBrand');
// The affiliate app (formerly Pousada) now uses the same workspace shell.
const affiliateLayout = readFileSync('src/app/afiliado/(app)/layout.tsx', 'utf8');
assert.match(affiliateLayout, /<WorkspaceShell[\s\S]*brandSubtitle="Afiliado"/,
  'Affiliate header uses the workspace StudentBrand header');

// So the header row must grow with its content instead of a fixed 56px box,
// keeping 56px as the minimum for the compact (logo mark + title) variant.
const row = mobile.split('export function MobileHeader(')[1]?.split('export function TabBar(')[0] ?? '';
assert.ok(row, 'MobileHeader must exist');
assert.doesNotMatch(row, /className="flex h-14 /, 'A fixed 56px row clips the two-line brand');
assert.match(row, /className="flex min-h-14 items-center gap-3 px-4 py-1"/,
  'Header row: 56px minimum, content-sized, with 4px vertical breathing room');

console.log(`PASS: workspace phone header fits the ${brandHeight.toFixed(1)}px logo and area label without clipping`);
