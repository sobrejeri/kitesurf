import type { Metadata } from 'next';

import { BookingChat } from '@/components/booking-chat';

export const metadata: Metadata = { title: 'Conversa da reserva' };
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookingChat bookingId={id} area="aluno" />;
}
