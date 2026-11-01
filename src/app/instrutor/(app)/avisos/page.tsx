import type { Metadata } from 'next';
import { NotificationInbox } from '@/components/notification-inbox';

export const metadata:Metadata={title:'Notificações'};
export default async function NoticesPage() {
  return <NotificationInbox area="instrutor"/>;
}
