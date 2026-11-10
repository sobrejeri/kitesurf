import type { Metadata } from 'next';
import { DesktopPageHeader } from '@/components/student/desktop-page-header';

import { ButtonLink, Card, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listBookingsForStudent } from '@/lib/data';

export const metadata: Metadata = { title: 'Minhas conversas' };

export default async function ConversationsPage() {
  const viewer = await requireRole(['student']);
  const bookings = await listBookingsForStudent(viewer.id);
  const conversations = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed');
  return (
    <div className="vento-pc-secondary-page vento-pc-conversations-screen vento-mobile-appbar-clearance">
      <DesktopPageHeader eyebrow="ATENDIMENTO" title="Minhas conversas" lead="Fale com os instrutores das suas reservas confirmadas." icon="chat" backHref="/aluno/aulas" variant="lesson"/>
      <div className="vento-pc-secondary-main">
      <PageHeader eyebrow="Atendimento" title="Minhas conversas" lead="Fale diretamente com seu instrutor após a confirmação da aula."/>
      <Card>
        {conversations.length === 0 ? <p className="text-[13px] text-muted">Ainda não existem conversas disponíveis. As mensagens são liberadas após a confirmação da aula.</p> : (
          <ul className="divide-y divide-line">
            {conversations.map(b => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <strong className="block truncate text-[15px] text-ink">{b.instructor?.full_name ?? 'Instrutor'}</strong>
                  <span className="text-[12px] text-muted">Reserva {b.id.slice(0,8)} · {b.beach?.name ?? 'Praia'}</span>
                </div>
                <ButtonLink href={`/aluno/atendimento/${b.id}`} size="sm">Abrir conversa</ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </div>
    </div>
  );
}
