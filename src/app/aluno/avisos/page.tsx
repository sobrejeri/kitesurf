import type { Metadata } from 'next';

import { StudentHero } from '@/components/student/sunset';

import { Inbox } from '@/components/shared';

export const metadata: Metadata = { title: 'Avisos' };

export default function StudentInboxPage() {
  return (
    <>
      <StudentHero eyebrow="Atualizações da plataforma" title="Avisos" lead="Push, e-mail e WhatsApp ainda não estão conectados." compact />
      <Inbox bare />
    </>
  );
}
