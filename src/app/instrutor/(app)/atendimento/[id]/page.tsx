import type { Metadata } from 'next';

import { BookingChat } from '@/components/booking-chat';

export const metadata: Metadata = { title: 'Conversa da reserva' };
export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ antes?: string; mensagem?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <BookingChat bookingId={id} area="instrutor" before={{at:query.antes,id:query.mensagem}} />;
}
