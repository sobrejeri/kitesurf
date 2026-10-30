import type { Metadata } from 'next';

import { Chat } from '@/components/shared';

export const metadata: Metadata = { title: 'Atendimento' };

export default function AdminChatPage() {
  return <Chat counterpart="Rafael Lima" counterpartRole="Instrutor" />;
}
