import type { Metadata } from 'next';

import { Inbox } from '@/components/shared';

export const metadata: Metadata = { title: 'Avisos da operação' };

export default function AdminInboxPage() {
  return <Inbox />;
}
