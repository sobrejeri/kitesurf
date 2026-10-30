import type { Metadata } from 'next';

import { Inbox } from '@/components/shared';

export const metadata: Metadata = { title: 'Avisos' };

export default function StudentInboxPage() {
  return <Inbox />;
}
