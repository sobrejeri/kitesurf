import type { Metadata } from 'next';

import { Chat } from '@/components/shared';

export const metadata: Metadata = { title: 'Conversas' };

export default function InstructorChatPage() {
  return <Chat counterpart="Luana" counterpartRole="Aluno" />;
}
