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

withinList(
  student,
  'bookings.map((booking) => (',
  '</div>\n        )}\n      </section>',
  '<section id="detalhes-reserva"',
  'Student booking details',
);
assert.ok(student.includes('id={\u0060reserva-${booking.id}\u0060}'),
  'Every student booking gets its own in-page anchor');
assert.ok(student.includes('selected?.id === booking.id ? ('),
  'Only the selected booking expands');
assert.ok(student.includes('getMeetingKiteSkills(selected.booking_meetings.map'),
  'Student skill lookup stays scoped to the selected booking');

console.log('PASS: student and instructor details render inline with their selected cards');
