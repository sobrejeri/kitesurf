import type { Metadata } from 'next';
import { DesktopPageHeader } from '@/components/student/desktop-page-header';
import { NotificationInbox } from '@/components/notification-inbox';

export const metadata:Metadata={title:'Notificações'};
export default async function NoticesPage() {
  return <div className="vento-pc-secondary-page vento-pc-notices-screen vento-mobile-appbar-clearance">
    <DesktopPageHeader eyebrow="NOTIFICAÇÕES" title="Central de avisos" lead="Mensagens, confirmações e atualizações importantes das suas aulas." icon="bell" backHref="/aluno/inicio" variant="coast"/>
    <div className="vento-pc-secondary-main"><NotificationInbox area="aluno"/></div>
  </div>;
}
