import type { Metadata } from 'next';

import { Chat } from '@/components/shared';
import { INSTRUCTOR } from '@/data/demo';

export const metadata: Metadata = { title: 'Conversa' };

export default function StudentChatPage() {
  return <Chat counterpart={INSTRUCTOR.name} counterpartRole="Instrutor" />;
}
