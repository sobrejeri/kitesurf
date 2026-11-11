import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ADMIN_NAV, INSTRUCTOR_NAV } from '../src/components/workspace-nav.ts';

// Instrutor and Admin "Vento Pro" workspace: one grouped menu per area feeds
// the sidebar, the phone tabs, the "Mais" sheet and the hub page. These checks
// keep every page reachable, the installed apps valid and the old orange gone.

function pageExists(href) {
  const [area, ...rest] = href.slice(1).split('/');
  return existsSync(join('src/app', area, '(app)', ...rest, 'page.tsx'));
}

function pageDirs(area) {
  const root = join('src/app', area, '(app)');
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'page.tsx')))
    .map((entry) => `/${area}/${entry.name}`);
}

for (const [area, nav, hub] of [
  ['instrutor', INSTRUCTOR_NAV, 'src/app/instrutor/(app)/central/page.tsx'],
  ['admin', ADMIN_NAV, 'src/app/admin/(app)/central/page.tsx'],
]) {
  const hrefs = nav.map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length, `${area}: a page is listed twice in the menu`);
  for (const item of nav) {
    assert.ok(item.group && item.label && item.icon, `${area}: ${item.href} needs a group, a label and an icon`);
    assert.ok(pageExists(item.href), `${area}: menu link ${item.href} has no page`);
  }
  assert.equal(nav.filter((item) => item.tab).length, 4, `${area}: the phone tab bar holds exactly four tabs (plus Mais)`);

  // Each group is contiguous, so the sidebar and the sheet read in menu order.
  const order = nav.map((item) => item.group).filter((group, i, all) => i === 0 || all[i - 1] !== group);
  assert.equal(new Set(order).size, order.length, `${area}: group items must be listed together`);

  // Every top-level page is reachable from the menu or, for the few
  // operational extras, from the hub. Detail, redirect and QR pages are linked
  // from their own context.
  const hubSource = readFileSync(hub, 'utf8');
  const contextual = new Set(['/instrutor/perfil', '/instrutor/checkin', '/instrutor/chat-live']);
  for (const href of pageDirs(area)) {
    if (contextual.has(href)) continue;
    assert.ok(hrefs.includes(href) || hubSource.includes(`href: '${href}'`), `${area}: ${href} is not reachable from the menu or the hub`);
  }
}

// The shell renders the grouped menu in the light Vento Pro theme.
const shells = readFileSync('src/components/shells.tsx', 'utf8');
const workspace = shells.split('export function WorkspaceShell(')[1]?.split('/** Tab labels have room')[0] ?? '';
assert.match(workspace, /className="theme-pro /, 'Workspace must use the Vento Pro theme');
assert.match(workspace, /groupTitles\.map/, 'Sidebar must render the menu by group');
assert.match(workspace, /groups: sheetGroups/, 'Phone "Mais" sheet must list the same groups');
assert.doesNotMatch(workspace, /theme-sunset/, 'Workspace must not fall back to the old orange theme');
const mobile = readFileSync('src/components/mobile.tsx', 'utf8');
assert.match(mobile, /groups \? \(/, 'MoreSheet must support grouped sections');
assert.match(mobile, /tone === 'navy' \? 'vk-chrome vk-appbar'/, 'Phone app bar must carry the navy staff tone');
const css = readFileSync('src/app/globals.css', 'utf8');
for (const token of ['body:has(.theme-pro)', '.vk-sidebar', '.vk-nav-link[aria-current=\'page\']', '.theme-pro-auth']) {
  assert.ok(css.includes(token), `globals.css must define ${token}`);
}

// No leftover orange/brown hard-coded in the staff pages and their kit.
const ORANGE = /#(?:ff8a3d|ff6a0f|ff7418|ffb052|fd8b31|3a2316|734329|191c2b|262130|2d2535)\b/i;
const staffFiles = [
  'src/components/admin/kit.tsx', 'src/components/admin/booking-progress.tsx', 'src/components/instructor/student-photo.tsx',
  'src/components/instructor/today-view.tsx', 'src/components/admin/overview-view.tsx',
];
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.tsx') ? [join(dir, entry.name)] : []);
for (const file of [...staffFiles, ...walk('src/app/instrutor'), ...walk('src/app/admin')]) {
  assert.doesNotMatch(readFileSync(file, 'utf8'), ORANGE, `${file} still hard-codes the old orange look`);
}

// Installable apps: manifest, scope, colours, shortcuts and real icon sizes.
function pngSize(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG', `${path} must be a PNG`);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
for (const [area, start] of [['instrutor', '/instrutor/hoje'], ['admin', '/admin/visao']]) {
  const manifest = JSON.parse(readFileSync(`public/apps/${area}.webmanifest`, 'utf8'));
  assert.equal(manifest.id, `/${area}/`);
  assert.equal(manifest.scope, `/${area}/`);
  assert.equal(manifest.start_url, start);
  assert.match(manifest.name, /^VentoKite /, `${area}: app name carries the VentoKite brand`);
  assert.equal(manifest.theme_color, '#0b1220', `${area}: status bar matches the navy app bar`);
  assert.equal(manifest.background_color, '#0b1220');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'), `${area}: needs a maskable icon`);
  for (const icon of manifest.icons) {
    const [w, h] = pngSize(join('public', icon.src));
    assert.equal(`${w}x${h}`, icon.sizes, `${icon.src} declared ${icon.sizes} but is ${w}x${h}`);
  }
  assert.ok(manifest.shortcuts?.length >= 3, `${area}: home-screen shortcuts to the daily pages`);
  for (const shortcut of manifest.shortcuts) {
    assert.ok(shortcut.url.startsWith(`/${area}/`) && pageExists(shortcut.url), `${area}: shortcut ${shortcut.url} must be a page in scope`);
  }
  const layout = readFileSync(`src/app/${area}/layout.tsx`, 'utf8');
  assert.match(layout, new RegExp(`manifest: '/apps/${area}\\.webmanifest'`), `${area}: layout links its own manifest`);
  assert.match(layout, /themeColor: '#0b1220'/, `${area}: viewport theme colour matches the manifest`);
}

console.log('PASS: grouped staff menus reach every page; Vento Pro shell, no old orange, valid Instrutor/Admin PWA manifests and icons');
