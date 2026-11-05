import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const instructor = readFileSync('src/app/instrutor/(app)/aula/page.tsx', 'utf8');
const student = readFileSync('src/app/aluno/(app)/evolucao/page.tsx', 'utf8');

function withinList(source, listStart, listEnd, detailTag, label) {
  const begin = source.indexOf(listStart);
  const end = source.indexOf(listEnd, begin);
  const detail = source.indexOf(detailTag);
  assert.ok(begin !== -1 && end > begin && detail > begin && detail < end,
    label + ' must be rendered adjacent to the selected card, not after all cards');
}

withinList(
  instructor,
  'groups[activeTab].map(({ booking, meeting }) => {',
  '</div>\n\n      {activeTab === \'proximas\' ? (',
  '<div id="detalhes-aula"',
  'Instructor start/continue forms',
);
withinList(
  instructor,
  'groups[activeTab].map(({ booking, meeting }) => {',
  '</div>\n\n      {activeTab === \'proximas\' ? (',
  '<section id="detalhes-aula"',
  'Instructor completed lesson details',
);
assert.ok(instructor.includes('id={\u0060aula-${meeting.id}\u0060}'),
  'Every instructor meeting gets its own in-page anchor');
assert.ok(instructor.includes("'#aula-' + meeting.id"),
  'Expanded instructor cards close back to themselves, not list top');
assert.ok(instructor.includes("getMeetingKiteSkills(selectedHistory ? [selectedHistory.meeting.id] : [])"),
  'Completed lesson details continue querying only the chosen encounter');

// Two intentionally supported student layouts:
// - reserve cards with inline expanded detail (legacy)
// - compact completed-lesson history with a dedicated selected detail section.
// Both must scope details to the signed-in student's selected booking.
const modernStudent = student.includes('doneEncounters.map(({ booking: b, meeting: m }) => {');
if (modernStudent) {
  const historyStart = student.indexOf('doneEncounters.map(({ booking: b, meeting: m }) => {');
  const detailStart = student.indexOf('<section id="detalhes-reserva"');
  assert.ok(historyStart >= 0 && detailStart > historyStart,
    'Student selected detail must follow its completed lesson history');
  assert.ok(student.includes('selected ? (') &&
    student.includes('getMeetingKiteSkills(selected.booking_meetings.map'),
    'Student detail and skill queries must only use the selected booking');
  assert.ok(student.includes('reserva=${b.id}#detalhes-reserva') &&
    student.includes('aria-current={open ? \'page\' : undefined}'),
    'Completed lessons must link to their selected detail section');
  assert.ok(student.includes("open ? 'border-[#00e3ee] bg-[#07516c]'") &&
    student.includes('bg-[#053954]') &&
    student.includes("{open ? 'Fechar' : 'Ver'}"),
    'Modern history must expose selection, contrast and a matching detail panel');
} else {
  withinList(
    student,
    'visibleBookings.map((booking) => (',
    '</div>\\n            ))}\\n          </div>',
    '<section id="detalhes-reserva"',
    'Student booking details',
  );
  assert.ok(student.includes('id={`reserva-${booking.id}`}'),
    'Every student booking gets its own in-page anchor');
  assert.ok(student.includes('selected?.id === booking.id ? ('),
    'Only the selected booking expands');
  assert.ok(student.includes('getMeetingKiteSkills(selected.booking_meetings.map'),
    'Student skill lookup stays scoped to the selected booking');
  assert.ok(student.includes('ring-[#00e3ee]/80') && student.includes('bg-[#053954]') &&
    student.includes('Detalhes abertos'),
    'Inline student selected cards must retain accessible contrast and clear state');
}

assert.ok(instructor.includes('ring-[#ff8a3d]/80') &&
  instructor.includes('bg-[#191c2b]') &&
  instructor.includes('Detalhes abertos') &&
  instructor.includes('const expanded = selected?.meeting.id === meeting.id;'),
  'Instructor details must retain selected-card contrast and expansion state');

console.log('PASS: student and instructor selection panels remain correctly scoped');
