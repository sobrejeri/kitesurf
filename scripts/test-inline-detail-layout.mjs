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

// The current student journey shows a list of completed meetings, then opens
// one reservation detail panel at #detalhes-reserva. The old test expected an
// inline per-card panel from a removed bookings.map layout.
assert.ok(student.includes('const selected = selectedStudentBooking(bookings, params.reserva)'),
  'Student reservation selection must remain scoped to RLS-loaded bookings');
assert.ok(student.includes('doneEncounters.map(({ booking: b, meeting: m }) => {') &&
  student.includes('const open = selected?.id === b.id;'),
  'Completed encounters must indicate only the selected reservation');
assert.ok(student.includes('href={open ? \'/aluno/evolucao\' : `/aluno/evolucao?reserva=${b.id}#detalhes-reserva`}') &&
  student.includes('aria-current={open ? \'page\' : undefined}'),
  'The meeting card must open or close its reservation details through an accessible link');
assert.ok(student.includes('<section id="detalhes-reserva"') &&
  student.includes('scroll-mt-5 rounded-[20px]') &&
  student.includes('Fechar detalhes'),
  'Selected reservation details must have an anchored panel and close action');
assert.ok(student.includes('getMeetingKiteSkills(selected.booking_meetings.map'),
  'Student skill lookup stays scoped to the selected booking');


assert.ok(instructor.includes('ring-[#ff8a3d]/80') &&
  instructor.includes('bg-[#191c2b]') &&
  instructor.includes('Detalhes abertos'),
  'Instructor selected cards must retain their contrast and expansion cues');
assert.ok(instructor.includes('const expanded = selected?.meeting.id === meeting.id;'),
  'Instructor selection must not make unrelated cards appear expanded');
console.log('PASS: instructor inline details and student anchored reservation detail remain scoped');
