import type { Metadata } from 'next';

import { StudentHero } from '@/components/student/sunset';

import { Chat } from '@/components/shared';
import { INSTRUCTOR } from '@/data/demo';

export const metadata: Metadata = { title: 'Conversa' };

export default function StudentChatPage() {
  return (
    <>
      <StudentHero eyebrow="Conversas" title="Fale com seu instrutor" highlight="instrutor" compact image="lesson" />
      <Chat bare counterpart={INSTRUCTOR.name} counterpartRole="Instrutor" />
    </>
  );
}
