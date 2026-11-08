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
assert.ok(shell.includes('const desktopRedesign = [') &&
  shell.includes("'/aluno/inicio','/aluno/aulas','/aluno/evolucao','/aluno/conta'") &&
  shell.includes("'/aluno/reservar','/aluno/atendimento','/aluno/avisos'") &&
  shell.includes('reserva|solicitacao|atendimento') &&
  shell.includes('vento-pc-sidebar') && shell.includes('aria-current={pathname===item.href') &&
  shell.includes('<StudentSwipePager pathname={pathname} signedIn={signedIn}>') &&
  shell.includes("import { StudentSwipePager } from './student/swipe-pager'") &&
  shell.includes('vento-pc-account-bar'),
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

// Desktop evolution refinements must never hide the mobile timeline or its states.
assert.ok(pcCss.includes('Desktop evolution follow-up: readable stage cards') &&
  pcCss.includes('.kite-m3-journey-section > ol > li > span[aria-hidden="true"]') &&
  pcCss.includes('display:none!important') &&
  pcCss.includes('@media (min-width:1024px) and (max-width:1500px)') &&
  studentEvolution.includes('kiteStageStatus(curriculumSkills, step.id)'),
  'Desktop evolution keeps real status calculations while hiding only conflicting desktop connectors');

// Student screens 05–17 now share the same desktop-only visual design.
// The existing server actions, forms, QR validation, chat and mobile markup stay intact.
const secondaryCss = read('src/app/aluno/(app)/desktop-secondary.css');
const authCss = read('src/app/aluno/auth-pc.css');
const authLayout = read('src/app/aluno/layout.tsx');
const authUI = read('src/components/auth/area-auth.tsx');
const recoveryUI = read('src/components/auth/password-recovery.tsx');
const desktopHeader = read('src/components/student/desktop-page-header.tsx');
assert.ok(studentLayout.includes("import './desktop-secondary.css'") &&
  authLayout.includes("import './auth-pc.css'") &&
  secondaryCss.includes('@media(min-width:1024px)') &&
  authCss.includes('@media(min-width:1024px)') &&
  secondaryCss.includes('.vento-pc-secondary-desktop-header{display:none}') &&
  authCss.includes('.vento-pc-auth-story{display:none}') &&
  desktopHeader.includes('vento-pc-detail-hero'),
  'Remaining screens must be desktop-only with mobile visual fallback');
const remainingRoutes = [
  'reservar/page.tsx','reserva/[id]/page.tsx','solicitacao/[id]/page.tsx',
  'atendimento/page.tsx','atendimento/[id]/page.tsx','avisos/page.tsx',
  'central/page.tsx','ocorrencias/page.tsx','politicas/page.tsx',
];
for(const route of remainingRoutes){
  const page=read('src/app/aluno/(app)/'+route);
  assert.ok(page.includes('DesktopPageHeader') &&
    page.includes('vento-pc-secondary-page'),
    'Missing desktop visual layout for student route '+route);
}
const desktopBuilderPage = read('src/app/aluno/(app)/reservar/page.tsx');
const desktopBookingPage = read('src/app/aluno/(app)/reserva/[id]/page.tsx');
const desktopRequestPage = read('src/app/aluno/(app)/solicitacao/[id]/page.tsx');
const desktopChatPage = read('src/app/aluno/(app)/atendimento/[id]/page.tsx');
assert.ok(desktopBuilderPage.includes('<LessonBuilder') &&
  desktopBookingPage.includes('<MeetingQR') &&
  desktopRequestPage.includes('<RequestPoller') &&
  desktopChatPage.includes('<BookingChat') &&
  authUI.includes('<ActionForm') &&
  recoveryUI.includes('<ActionForm') &&
  authUI.includes('<StudentDesktopAuthStory') &&
  recoveryUI.includes('<StudentDesktopAuthStory'),
  'Existing booking, QR, queue, chat and authentication functionality must remain mounted');
assert.ok(secondaryCss.includes('.vento-voucher-qr svg') &&
  secondaryCss.includes('.vento-pc-incidents-screen') &&
  secondaryCss.includes('.vento-pc-central-screen') &&
  authCss.includes('.vento-pc-recovery-auth'),
  'Desktop system must include voucher, support and recovery layouts');



// Visual refinement regression: desktop reading surfaces and chat bubbles.
// Prevent global dark-theme text overrides from making light backgrounds unreadable.
assert.ok(
  secondaryCss.includes('.vento-pc-conversations-screen .vento-pc-secondary-main > .rounded-card') &&
  secondaryCss.includes('.vento-pc-notices-screen .vento-pc-secondary-main > .rounded-card') &&
  secondaryCss.includes('background:#f7fbff;color:#0a2b41') &&
  secondaryCss.includes('background:#f8fcff;border-color:#badde9;color:#0c3045') &&
  secondaryCss.includes('ol li > .bg-sand.text-ink') &&
  secondaryCss.includes('color:#113449!important') &&
  secondaryCss.includes('ol li > .bg-brand') &&
  secondaryCss.includes('color:#092c3d!important'),
  'Desktop inbox/notification cards and incoming/outgoing chat bubbles must retain readable contrast',
);
assert.ok(
  secondaryCss.includes('.vento-pc-voucher-layout .vento-voucher-paper') &&
  secondaryCss.includes('.vento-pc-policies-screen .vento-pc-secondary-main .rounded-card') &&
  secondaryCss.includes('@media (min-width:1024px) and (max-width:1190px)') &&
  secondaryCss.includes('@media (min-width:1024px) and (prefers-reduced-motion:reduce)') &&
  authCss.includes('Screens 14–17: refined desktop sign-in family') &&
  authCss.includes('@media(min-width:1024px) and (max-height:800px)'),
  'Desktop refinement must keep the voucher and policy reading layouts, compact screens and reduced motion',
);


// Profile-only mobile header: use the real alpha logo at 70%, centered on the
// uninterrupted page gradient, and do not download the decorative kite.
const mobileProfileCss = read('src/app/aluno/(app)/profile-approved.css');
const profileHeaderComponent = read('src/components/student/modelo3-header.tsx');
const mobileProfilePage = read('src/app/aluno/(app)/conta/page.tsx');
assert.ok(
  mobileProfileCss.includes('@media (max-width:767px)') &&
  mobileProfileCss.includes('body:has(.kite-modelo3--profile) .theme-beach.theme-mar-profundo') &&
  mobileProfileCss.includes('.kite-modelo3--profile .kite-m3-header {') &&
  mobileProfileCss.includes('background-image:none') &&
  mobileProfileCss.includes('.kite-m3-header__inner {') &&
  mobileProfileCss.includes('justify-content:center') &&
  mobileProfileCss.includes('width:min(42.7vw,158px)') &&
  mobileProfileCss.includes('background:transparent') &&
  mobileProfilePage.includes('<KiteModelo3Header hideKite />') &&
  profileHeaderComponent.includes('hideKite ? null : <img') &&
  profileHeaderComponent.includes('src="/images/vento-kite-real.webp"'),
  'Mobile profile must show a centered 70%-scale logo over a continuous gradient, with no kite or header rectangle',
);
assert.ok(
  mobileProfilePage.includes('<ProfilePhotoPicker') &&
  mobileProfilePage.includes('<ProfileEditor') &&
  mobileProfilePage.includes('<KiteLevelEditor') &&
  studentLayout.includes("import './profile-approved.css'"),
  'Profile interactions and existing mobile component mounting must remain unchanged',
);


// The profile's mobile back arrow uses an actual local route (not browser
// history) and must not displace the centered brand or the menu.
assert.ok(
  shell.includes("pathname === '/aluno/conta' ? (") &&
  shell.includes('href="/aluno/inicio" aria-label="Voltar ao início"') &&
  shell.includes('<Icon name="back" />') &&
  shell.includes('className="pointer-events-auto kite-m3-menu-button"'),
  'Profile mobile top bar must offer an accessible back arrow and retain the menu',
);
assert.ok(
  mobileProfileCss.includes('min-height:124px;') &&
  mobileProfileCss.includes('margin-bottom:0;') &&
  mobileProfileCss.includes('padding-bottom:4px;') &&
  mobileProfileCss.includes('width:min(42.7vw,158px)') &&
  mobileProfilePage.includes('<ProfilePhotoPicker'),
  'Profile avatar must sit nearer the existing 70%-size logo, without altering the portrait',
);



// The visible content must follow the finger. Adjacent authenticated page
// snapshots are only inert visuals; route navigation stays server-authorized.
const pager = read('src/components/student/swipe-pager.tsx');
const phoneTabs = [
  '/aluno/inicio', '/aluno/aulas', '/aluno/reservar',
  '/aluno/evolucao', '/aluno/conta',
];
const swipeDeclaration = pager.match(/export const STUDENT_SWIPE_ROUTES = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
assert.deepEqual(
  [...swipeDeclaration.matchAll(/'(\/aluno\/[^']+)'/g)].map((match) => match[1]),
  phoneTabs,
  'Student swipe track must match the visual order including middle Agendar',
);
assert.ok(
  shell.includes("import { StudentSwipePager } from './student/swipe-pager'") &&
  shell.includes('<StudentSwipePager pathname={pathname} signedIn={signedIn}>') &&
  shell.includes('</StudentSwipePager>') &&
  !shell.includes('onTouchStart={onStudentTouchStart}') &&
  pager.includes("signedIn && index >= 0") &&
  pager.includes("const isMobile = () => window.innerWidth < 768") &&
  pager.includes('if (!route) {') &&
  pager.includes("const direction = dx < 0 ? 1 : -1") &&
  pager.includes("STUDENT_SWIPE_ROUTES[index + direction] ?? null"),
  'Only exact student mobile tabs may swipe; Explorar right and Perfil left are hard stops',
);
assert.ok(
  pager.includes("page.addEventListener('touchmove', onMove, { passive: false })") &&
  pager.includes("page.addEventListener('touchstart', onStart, { passive: false })") &&
  pager.includes("event.preventDefault()") &&
  pager.includes("g.axis = 'vertical'; return") &&
  pager.includes("Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.3") &&
  pager.includes("target.closest(IGNORE_SWIPE)") &&
  pager.includes("window.getComputedStyle(node).overflowX") &&
  pager.includes("onMove") &&
  pager.includes("page.style.transform = \`translate3d(\${g.dx}px,0,0)\`") &&
  pager.includes("incoming.style.transform = \`translate3d(\${offset + g.dx}px,0,0)\`") &&
  pager.includes('incoming.style.transform = \x27translate3d(0,0,0)\x27') &&
  pager.includes("router.replace(destination, { scroll: true })"),
  'Interactive swipe must follow the finger, attach neighbor, snap/rollback, and preserve vertical controls',
);
assert.ok(
  pager.includes("await fetch(route, {") &&
  pager.includes("credentials: 'same-origin'") &&
  pager.includes("response.headers.get('content-type')?.includes('text/html')") &&
  pager.includes("doc.querySelector('main.vento-student-main')") &&
  pager.includes("main.querySelectorAll('script,style,iframe,object,embed,link,meta,template')") &&
  pager.includes("ref={preview} inert aria-hidden=\x22true\x22") &&
  !pager.includes('<TabBar') &&
  !pager.includes('<FloatingChat') &&
  pager.includes("window.matchMedia('(prefers-reduced-motion: reduce)')"),
  'Adjacent page preview must be authenticated, inert, script-free and exclude duplicated nav or chat',
);

const studentNavComponent = read('src/components/mobile.tsx');
const studentNavigationCss = read('src/app/aluno/(app)/modelo3.css');
assert.ok(studentNavigationCss.includes('Interactive student pager: neighboring PAGE CONTENT moves with the finger') &&
  studentNavigationCss.includes('.vento-student-swipe-viewport') &&
  studentNavigationCss.includes('.vento-student-swipe-preview') &&
  studentNavigationCss.includes('touch-action:pan-y'),
  'Swipe preview must stay clipped inside one mobile viewport with vertical scroll available');
assert.ok(
  pager.includes("touch.clientX <= 28 || touch.clientX >= window.innerWidth - 28") &&
  pager.includes("page.addEventListener('touchstart', onStart, { passive: false })") &&
  pager.includes("page.addEventListener('touchmove', onMove, { passive: false })") &&
  pager.includes("router.replace(destination, { scroll: true })") &&
  pager.includes('ref={viewport}') &&
  pager.includes('data-student-swipe={active ? \x27true\x27 : undefined}'),
  'Mobile tab swipes must suppress iOS edge history and horizontal page pan while preserving vertical scroll',
);
assert.ok(
  studentNavComponent.includes("const centerActive = Boolean(center && isActive(pathname, center))") &&
  studentNavComponent.includes("const active = !centerActive && isActive(pathname, item)") &&
  studentNavComponent.includes("aria-current={centerActive ? 'page' : undefined}") &&
  studentNavComponent.includes("vento-student-single-tabbar") &&
  studentNavigationCss.includes("Mobile student navigation is a single stable application-level footer") &&
  studentNavigationCss.includes("nav.vento-student-single-tabbar") &&
  studentNavigationCss.includes('a[aria-label="Agendar"]:not([aria-current="page"]) > span:first-child') &&
  studentNavigationCss.includes('background:#0b3a4e !important') &&
  studentNavigationCss.includes('a[aria-label="Agendar"][aria-current="page"] > span:first-child'),
  'Exactly one highlighted tab must be visible in one fixed shared bar on every student screen',
);

console.log('PASS: desktop layout and profile photo plus layered meeting-conflict protection');
