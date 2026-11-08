import type { Metadata } from 'next';
import { DesktopPageHeader } from '@/components/student/desktop-page-header';

import { BookingChat } from '@/components/booking-chat';

export const metadata: Metadata = { title: 'Conversa da reserva' };
export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ antes?: string; mensagem?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <div className="vento-pc-secondary-page vento-pc-chat-screen">
    <DesktopPageHeader eyebrow="CONVERSA DA RESERVA" title="Bate-papo com instrutor"
      lead="Mensagens e arquivos da sua aula, em um espaço organizado." icon="chat"
      backHref="/aluno/atendimento" variant="lesson"/>
    <div className="vento-pc-secondary-main">
      <BookingChat bookingId={id} area="aluno" before={{at:query.antes,id:query.mensagem}} />
    </div>
  </div>;
}
