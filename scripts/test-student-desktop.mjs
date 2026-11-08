import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const shell = read('src/components/shells.tsx');
const layout = read('src/app/aluno/(app)/layout.tsx');
const home = read('src/app/aluno/(app)/inicio/page.tsx');
const hero = read('src/components/student/home-poster-hero.tsx');
const lessons = read('src/app/aluno/(app)/aulas/page.tsx');
const sunset = read('src/components/student/sunset.tsx');
const css = read('src/app/aluno/(app)/mar-profundo.css');
const search = read('src/components/student/lesson-search.tsx');
const builder = read('src/components/student/lesson-builder.tsx');
const booking = read('src/app/actions/booking.ts');
const migration = read('supabase/migrations/20261103000032_student_request_schedule_guard.sql');

assert.ok(shell.includes('vento-desktop-student-header'), 'Desktop student should own its header');
assert.ok(layout.includes('vento-student-avatars') &&
  layout.includes('.createSignedUrl(profile.avatar_path, 3600)'),
  'Signed-in student avatar should come from the private Storage bucket');
const avatar = read('src/components/student/profile-avatar.tsx');
assert.ok(shell.includes('StudentProfileAvatar') && avatar.includes('object-cover'),
  'Desktop profile circle should render the avatar, with initials fallback');
assert.ok(hero.includes('vento-desktop-home-hero') && hero.includes('lg:hidden'),
  'Desktop hero must be distinct from the existing mobile banner');
assert.ok(statSync('public/images/prea-coast.webp').size > 100_000,
  'Desktop photograph must not be a pixelated thumbnail');
assert.ok(lessons.includes('vento-student-desktop-lessons') && css.includes('.vento-student-desktop-lessons'),
  'My Lessons should share the light desktop layout and retain the working lesson list');
assert.ok(sunset.includes("ocean: { src: '/images/prea-coast.webp'"),
  'Ocean page headers must not use the blurry 3.8 KB thumbnail');
assert.ok(home.includes('vento-student-desktop-home') &&
  home.includes('<HomeDashboard') && home.includes('<LessonSearch'),
  'Explore must retain the actual dashboard for returning students and lesson search for new students');
const desktopSearchRule = css.match(/\.vento-student-desktop-home \.vento-desktop-search \{([^}]+)\}/s)?.[1] ?? '';
const desktopColumns = desktopSearchRule.match(/grid-template-columns:([^;]+);/s)?.[1] ?? '';
assert.ok((desktopColumns.match(/minmax\([^)]*\)/g) ?? []).length === 6 &&
  css.includes('body:has(.theme-mar-profundo) > .sticky.top-0'),
  'Desktop search should be a horizontal row with a single header');
assert.ok(search.includes('vento-desktop-search-fields') &&
  search.includes('action="/aluno/reservar"'),
  'Desktop booking controls must still submit through the existing reservation route');
assert.ok(builder.includes('meetingsOverlap') &&
  builder.includes('!meetingsOverlap') &&
  builder.includes('Você colocou dois encontros no mesmo horário'),
  'A student should see immediate feedback for overlapping meetings');
assert.ok(migration.includes('pg_advisory_xact_lock') &&
  migration.includes("r.status = 'searching'") &&
  migration.includes("b.status IN ('awaiting_payment', 'confirmed')"),
  'The backend must reject simultaneous requests and conflicts with existing bookings');
assert.ok(booking.includes('const timeSlots = parsed.data.meetings.map') &&
  booking.includes('Há encontros no mesmo dia e horário'),
  'Server must also guard against forged overlapping meetings');
assert.ok(booking.includes("create_instructor_request_with_preference"),
  'Student search should still call the secure instructor queue RPC');
// The phone top menu is nested in a pointer-events:none app bar. Its overlay
// MUST render at the body level or taps outside cannot close it on iPhones.
const mobile = read('src/components/mobile.tsx');
const sheet = mobile.split('function MoreSheet(')[1]?.split('/** Account block')[0] ?? '';
assert.ok(shell.includes('pointer-events-none pt-safe absolute') &&
  mobile.includes("import { createPortal } from 'react-dom';") &&
  sheet.includes('return createPortal(') &&
  sheet.includes('document.body') &&
  sheet.includes('pointer-events-auto fixed inset-0 z-[70]'),
  'Mobile menu dialog must be portaled above the click-through app header and tab bar');
assert.ok(sheet.includes('aria-label="Fechar menu"') &&
  sheet.includes('onClick={onClose}') &&
  sheet.includes("event.key === 'Escape'") &&
  mobile.includes('current === pathname ? null : pathname'),
  'Mobile menu must close via a visible button, backdrop, Escape and trigger toggle');
assert.ok(sheet.includes('href={link.href}') &&
  sheet.includes('onClick={onClose}'),
  'Mobile menu navigation must close the sheet even when the URL does not change');

const menuTheme = read('src/app/globals.css');
assert.ok(shell.includes('studentStyle') &&
  sheet.includes("studentStyle ? 'vento-student-menu' : ''") &&
  sheet.includes('vento-student-menu-tile') &&
  sheet.includes('vento-student-menu-icon') &&
  sheet.includes('vento-student-menu-label'),
  'Student-only menu must separate icon squares and text without changing other role menus');
assert.ok(menuTheme.includes('.vento-student-menu .vento-student-menu-tile {') &&
  menuTheme.includes('width: min(50%, 64px)') &&
  menuTheme.includes('aspect-ratio: 1 / 1') &&
  menuTheme.includes('.vento-student-menu .vento-student-menu-icon {') &&
  menuTheme.includes('width: 80% !important') &&
  menuTheme.includes('height: 80% !important'),
  'Student mobile menu tiles must be 50%-width squares with 80%-sized icons');
assert.ok(menuTheme.includes('max-height: 42dvh') &&
  menuTheme.includes('overflow-y: auto') &&
  menuTheme.includes('overscroll-behavior: contain') &&
  menuTheme.includes('row-gap: 8px') &&
  menuTheme.includes('font-size: 10px') &&
  menuTheme.includes('min-height: 42px'),
  'Compact student menu must stay scrollable, halve its height and preserve accessible controls');
assert.ok(menuTheme.includes('color: #baff06') &&
  menuTheme.includes('border-top: 1px solid #20bfc9') &&
  menuTheme.includes('.vento-student-menu .vento-student-menu-label'),
  'Student sheet must use the lime/turquoise brand and labels outside icon tiles');

// "Conta e acesso" is redundant with the existing student Perfil tab.
// Keep old bookmarks working, and keep every account action available.
const studentProfile = read('src/app/aluno/(app)/conta/page.tsx');
const legacyAccess = read('src/app/aluno/(app)/acesso/page.tsx');
assert.ok(!shell.includes("label: 'Conta e acesso'") &&
  shell.includes("{ label: 'Perfil', href: '/aluno/conta'") &&
  legacyAccess.includes("redirect('/aluno/conta')"),
  'Student menu must avoid a redundant account page while old bookmarks redirect to Perfil');
assert.ok(studentProfile.includes('<ProfileEditor') &&
  studentProfile.includes('href="/aluno/recuperar"') &&
  studentProfile.includes('action={signOut}'),
  'Student Perfil must retain profile editing, password recovery, and sign out');

// Voucher foreground colors must remain readable on both the light ticket
// and the instructor's dark photo card. Mobile information tiles must not
// squeeze four tiny labels into one row.
const voucherCss = read('src/app/aluno/(app)/voucher-approved.css');
const voucherScreen = read('src/app/aluno/(app)/reserva/[id]/page.tsx');
assert.ok(voucherScreen.includes('vento-voucher-instructor') &&
  voucherScreen.includes('vento-voucher-meeting') &&
  voucherScreen.includes('vento-voucher-eyebrow') &&
  voucherCss.includes('.vento-voucher-instructor .text-white') &&
  voucherCss.includes('color:#fff!important') &&
  !voucherCss.includes('.vento-voucher-paper :is(.text-ink,.text-white)'),
  'Voucher must not recolor light instructor text dark on a navy card');
assert.ok(voucherCss.includes('.vento-voucher-meeting .bg-brand-soft') &&
  voucherCss.includes('details.group > summary') &&
  voucherCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))') &&
  voucherCss.includes('.vento-voucher-paper .vento-voucher-eyebrow'),
  'Mobile voucher must use readable two-column tiles and distinct reschedule/status contrast');

// First desktop-only redesign batch (screens 01–04). These tests prevent
// accidentally replacing the existing PWA/mobile layouts with the new sidebar.
const pcCss = read('src/app/aluno/(app)/desktop-redesign.css');
const studentLayout = read('src/app/aluno/(app)/layout.tsx');
const desktopHome = read('src/components/student/desktop-home.tsx');
const desktopLessons = read('src/components/student/desktop-lessons.tsx');
const studentHomePage = read('src/app/aluno/(app)/inicio/page.tsx');
const studentLessonsPage = read('src/app/aluno/(app)/aulas/page.tsx');
const studentEvolution = read('src/app/aluno/(app)/evolucao/page.tsx');
assert.ok(pcCss.includes('@media (min-width:1024px)') &&
  pcCss.includes('.vento-pc-sidebar,.vento-pc-account-bar,.vento-pc-desktop-only{display:none}') &&
  pcCss.includes('.vento-student-redesign .vento-pc-mobile-original{display:none}') &&
  pcCss.includes('.vento-pc-evolution-columns{display:contents}') &&
  studentLayout.includes("import './desktop-redesign.css'"),
  'Desktop redesign must be scoped to >=1024px and preserve original mobile components');
assert.ok(shell.includes("const desktopRedesign = ['/aluno/inicio','/aluno/aulas','/aluno/evolucao','/aluno/conta'].includes(pathname)") &&
  shell.includes('vento-pc-sidebar') && shell.includes('aria-current={pathname===item.href') &&
  shell.includes('vento-student-main') && shell.includes('vento-pc-account-bar'),
  'Approved desktop sidebar must be route-scoped, navigable and keyboard-accessible');
assert.ok(studentHomePage.includes('<DesktopStudentHome bookings={bookings}') &&
  studentHomePage.includes('<HomeDashboard bookings={bookings}') &&
  studentHomePage.includes('vento-pc-mobile-original') &&
  desktopHome.includes('studentHomeSummary(bookings)') &&
  desktopHome.includes('current.booking.id'),
  'Desktop home must use real student booking data and retain untouched mobile home');
assert.ok(studentLessonsPage.includes('<DesktopStudentLessons lessons={lessons}') &&
  studentLessonsPage.includes('<MyLessons key={initialTab}') &&
  desktopLessons.includes('useState<Filter>') &&
  desktopLessons.includes('lessons.filter(') &&
  desktopLessons.includes('lesson.evolutionHref'),
  'Desktop lesson filters must navigate actual meetings while mobile MyLessons remains available');
assert.ok(studentEvolution.includes('vento-pc-evolution-columns') &&
  studentEvolution.includes('vento-pc-evolution-metrics') &&
  studentProfile.includes('completedMeetings') &&
  studentProfile.includes('ProfilePhotoPicker') &&
  studentProfile.includes('ProfileEditor'),
  'Desktop evolution and profile must retain real data and photo/edit actions');

console.log('PASS: desktop layout and profile photo plus layered meeting-conflict protection');
