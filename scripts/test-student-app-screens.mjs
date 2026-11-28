import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Browsers may format en-CA dates in different orders. Simulate an engine
// returning MM/DD/YYYY from format(), while preserving Intl's date parts.
const NativeDateTimeFormat = Intl.DateTimeFormat;
Intl.DateTimeFormat = new Proxy(NativeDateTimeFormat, {
  construct(target, args) {
    const formatter = Reflect.construct(target, args);
    if (args[0] !== 'en-CA') return formatter;
    return new Proxy(formatter, {
      get(instance, property) {
        if (property === 'format') return (value) => {
          const parts = Object.fromEntries(instance.formatToParts(value).map(({type, value}) => [type, value]));
          return `${parts.month}/${parts.day}/${parts.year}`;
        };
        const value = Reflect.get(instance, property, instance);
        return typeof value === 'function' ? value.bind(instance) : value;
      },
    });
  },
});
const { formatLessonWhen, formatRelativeStamp } = await import('../src/lib/format.ts');
Intl.DateTimeFormat = NativeDateTimeFormat;

// Student screens "com cara de app" (2026-11-11): compact titles instead of
// web-page heroes, inbox/messenger rows instead of underlined links, readable
// own chat bubbles and no word broken in the middle on the home cards.
const read = (path) => readFileSync(path, 'utf8');
const ROOT = 'src/app/aluno/(app)';

// 1. Secondary screens open with the compact phone title, never a lead paragraph.
const title = read('src/components/student/page-title.tsx');
assert.match(title, /lg:hidden/, 'Phone title hides where the desktop header takes over');
for (const [file, label] of [
  [`${ROOT}/central/page.tsx`, 'central'],
  [`${ROOT}/politicas/page.tsx`, 'policies'],
  [`${ROOT}/atendimento/page.tsx`, 'conversations'],
  [`${ROOT}/solicitacao/[id]/page.tsx`, 'request'],
  ['src/components/notification-inbox.tsx', 'notifications'],
  ['src/components/incident-workspace.tsx', 'incidents'],
]) {
  assert.ok(read(file).includes('<StudentPageTitle'), `Student ${label} screen must use the compact title`);
}
for (const page of ['central', 'politicas']) {
  assert.doesNotMatch(read(`${ROOT}/${page}/page.tsx`), /<StudentHero\b/, `${page} must not open with a photo hero on phones`);
}
assert.doesNotMatch(read(`${ROOT}/central/page.tsx`) + read(`${ROOT}/politicas/page.tsx`), /Fluxos da plataforma|Tudo organizado por etapa/,
  'Prototype copy must not headline student screens');

// 2. Notifications: whole row opens it, relative time, no underlined "Abrir atualização".
const inbox = read('src/components/notification-inbox.tsx');
assert.ok(inbox.includes("after:absolute after:inset-0") && inbox.includes('formatRelativeStamp(n.created_at,now)'),
  'Each notice is a single tap target with an app-style time');
assert.ok(!inbox.includes('Abrir atualização') && !inbox.includes('Push externo'),
  'No underlined open link and no implementation note in the inbox');
assert.ok(inbox.includes('markNotificationRead'), 'Marking as read keeps working');

// 3. Conversations: messenger rows with the booking code, never a raw id slice.
const threads = read(`${ROOT}/atendimento/page.tsx`);
assert.ok(threads.includes('{booking.code}') && !threads.includes('.id.slice(0,8)') && !threads.includes('id.slice(0, 8)'),
  'A conversation shows the booking code, not part of its internal id');
assert.ok(threads.includes("eq('booking_id', booking.id)") && threads.includes('listBookingsForStudent(viewer.id)'),
  'Last-message previews stay scoped to the student’s own bookings');

// 4. Chat: own bubbles use the on-brand ink (white on lime was unreadable).
const chat = read('src/components/booking-chat.tsx');
const ownBubble = chat.match(/\? '([^']*bg-brand[^']*)'/)?.[1] ?? '';
assert.ok(ownBubble.includes('text-on-brand') && !ownBubble.includes('text-white'),
  'Own chat bubbles must use text-on-brand for contrast in every theme');
assert.ok(chat.includes('data-chat-navigation="page"') && chat.includes('sendBookingMessage') && chat.includes('<LiveConversation'),
  'Refresh, sending and live updates remain wired');
assert.ok(chat.includes('vento-chat-composer') && chat.includes('className="sr-only">Sua mensagem'),
  'Composer keeps an accessible label');

// 5. Booking detail: the discreet issue link gets its own line, and the
//    learning balance fills the side column next to the voucher.
const voucherCss = read(`${ROOT}/voucher-approved.css`);
assert.ok(voucherCss.includes('.vento-voucher nav a[href="/aluno/ocorrencias"] {grid-column:1 / -1'),
  'Issue link must not be squeezed into half the width');
const booking = read(`${ROOT}/reserva/[id]/page.tsx`);
const sideColumn = booking.slice(booking.lastIndexOf('<div className="grid content-start gap-5">'));
assert.ok(sideColumn.includes('Seu saldo de aprendizado') && sideColumn.includes('<BalanceMeetingPanel'),
  'Learning balance and make-up requests live in the side column');
assert.ok(!booking.includes('Abrir localização no mapa'), 'Map link is a compact button');

// 6. Home: long level labels shrink instead of breaking mid-word.
const home = read('src/components/student/home-dashboard.tsx');
const homeCss = read('src/components/student/home-dashboard.module.css');
assert.ok(home.includes('levelLabel.length > 12 ? styles.longLevel') &&
  homeCss.includes('.insightCard h2.longLevel {font-size:clamp(14px,4.1vw,19px);overflow-wrap:break-word;hyphens:manual;}'),
  '"Em acompanhamento" must fit without being split inside the word');

// 7. Desktop secondary header is compact: no photographic banner image.
const desktopHeader = read('src/components/student/desktop-page-header.tsx');
assert.ok(!desktopHeader.includes('<img') && desktopHeader.includes('vento-pc-secondary-back'),
  'Desktop secondary pages use a compact header with a back button');

// 8. Time labels in Ceará time.
const now = Date.parse('2026-11-11T15:00:00Z'); // 12:00 in Fortaleza
assert.equal(formatRelativeStamp('2026-11-11T14:59:40Z', now), 'Agora');
assert.equal(formatRelativeStamp('2026-11-11T14:48:00Z', now), 'Há 12 min');
assert.equal(formatRelativeStamp('2026-11-11T11:00:00Z', now), 'Hoje, 08:00');
assert.equal(formatRelativeStamp('2026-11-11T02:30:00Z', now), 'Ontem, 23:30', 'Late-night UTC is still yesterday in Ceará');
assert.equal(formatRelativeStamp('2026-11-04T12:00:00Z', now), '4 de nov.');
assert.equal(formatRelativeStamp('2025-12-30T12:00:00Z', now), '30 de dez. de 2025');
assert.equal(formatLessonWhen('2026-11-11T20:00:00Z', now), 'hoje às 17:00');
assert.equal(formatLessonWhen('2026-11-12T12:00:00Z', now), 'amanhã às 09:00');
assert.equal(formatLessonWhen('2026-11-14T18:30:00Z', now), 'sáb., 14 de nov. às 15:30');

console.log('PASS: student screens use app titles, inbox/messenger rows, readable chat, fitted labels and Ceará-time stamps');

// The same historical accepted-offer notification must be accurate in validation mode.
const { notificationBody } = await import('../src/lib/notification-copy.ts');
const legacyOffer = {
  category: 'offer', title: 'Instrutor aceitou a aula',
  body: 'Sua solicitação foi aceita. Acesse para continuar o pagamento.',
  href: '/aluno/solicitacao/7f0c1d2e-3a4b-4c5d-8e9f-001122334455',
};
assert.equal(notificationBody(legacyOffer, true), 'Sua solicitação foi aceita. Acesse a reserva para confirmar a aula de validação, sem cobrança.');
assert.equal(notificationBody(legacyOffer, false), legacyOffer.body, 'Checkout mode retains its existing wording');
for (const patch of [{category:'booking'}, {title:'Outro aviso'}, {href:'/instrutor/solicitacao'}, {href:'/aluno/solicitacao/not-a-uuid'}, {body:'Texto novo'}]) {
  const notice = {...legacyOffer, ...patch};
  assert.equal(notificationBody(notice, true), notice.body, 'Unrelated notices must remain unchanged');
}
assert.ok(inbox.includes("notificationBody(n, area === 'aluno' && VALIDATION_WITHOUT_CHECKOUT)"));
console.log('PASS: accepted offer copy follows validation mode without changing historical rows or unrelated alerts');
