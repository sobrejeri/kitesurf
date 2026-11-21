import type { Metadata } from 'next';
import { DesktopPageHeader } from '@/components/student/desktop-page-header';
import { notFound } from 'next/navigation';

import { RequestPoller } from '@/components/student/request-poller';
import { respondToSuggestedDate } from '@/app/actions/suggestions';
import { ActionForm } from '@/components/action-form';
import { formatDateLong, formatTime } from '@/lib/format';
import { Badge, ButtonLink, Card, Note } from '@/components/ui';
import { StudentPageTitle } from '@/components/student/page-title';
import { requireRole } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { VALIDATION_WITHOUT_CHECKOUT } from '@/lib/booking-mode';

export const metadata: Metadata = { title: 'Buscar instrutor' };

interface RequestRow {
  id: string;
  status: 'searching' | 'accepted' | 'expired' | 'cancelled';
  booking_id: string | null;
  total_hours: number;
  created_at: string;
  expires_at: string;
  price_version_id: number;
  preferred_instructor_id: string | null;
}

export default async function InstructorRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireRole(['student']);
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const db = await createSupabaseServerClient();
  const { data: request, error } = await db.from('instructor_requests')
    .select('id,status,booking_id,total_hours,created_at,expires_at,price_version_id,preferred_instructor_id')
    .eq('id', id).eq('student_id',viewer.id).maybeSingle<RequestRow>();
  if (error) return (
    <Note tone="warning">O serviço de ofertas ainda não está disponível no Supabase. Instale a migração 11.</Note>
  );
  if (!request) notFound();
  const quoted = await db.rpc('my_instructor_request_quote', { p_request_id: request.id });
  const quote = !quoted.error ? quoted.data?.[0] as { total_cents: number } | undefined : undefined;
  const { data: suggestion } = request.status === 'searching'
    ? await db.rpc('read_my_offer_suggestion', { p_request_id: request.id })
    : { data: null };
  interface SuggestedMeeting { starts_at: string; hours: number }
  interface Suggestion { id: string; meetings: SuggestedMeeting[]; expires_at: string }
  const proposed = suggestion && typeof suggestion === 'object' &&
    'id' in suggestion && 'meetings' in suggestion
      ? suggestion as Suggestion : null;
  const accepted = request.status === 'accepted' && Boolean(request.booking_id);
  const searching = request.status === 'searching';
  const cancelled = request.status === 'cancelled';
  const title = {
    accepted: 'Instrutor encontrado!',
    searching: 'Procurando seu instrutor',
    expired: 'Prazo da busca encerrado',
    cancelled: 'Solicitação cancelada',
  }[request.status];
  const subtitle = accepted
    ? (VALIDATION_WITHOUT_CHECKOUT ? 'Confira a reserva e confirme sem cobrança.' : 'Agora é só concluir o pagamento de teste.')
    : searching ? 'Sua proposta foi enviada aos instrutores compatíveis.' : 'Você pode escolher novos horários.';
  return (
    <div className="vento-pc-secondary-page vento-pc-request-screen vento-mobile-appbar-clearance">
      <DesktopPageHeader eyebrow="SUA SOLICITAÇÃO" title={title} lead={subtitle} icon="users" backHref="/aluno/aulas" variant="coast"/>
      <div className="vento-pc-secondary-main">
      <StudentPageTitle title={title} subtitle={subtitle}/>
      <Card className="max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <strong className="text-[17px] text-ink">{request.total_hours}h de kitesurf</strong>
          <Badge tone={accepted ? 'success' : 'warning'}>
            {accepted ? 'Aceita' : searching ? 'Buscando' : cancelled ? 'Cancelada' : 'Encerrada'}
          </Badge>
        </div>
        {quote ? <p className="mt-2 text-[13px] text-muted">
          Valor estimado da aula: {formatMoney(quote.total_cents)}.
          {VALIDATION_WITHOUT_CHECKOUT ? ' Validação sem cobrança.' : ' Inclui transporte, quando escolhido.'}
        </p> : null}
        {accepted && request.booking_id ? (
          <ButtonLink href={'/aluno/reserva/' + request.booking_id} className="mt-5 w-full">
            {VALIDATION_WITHOUT_CHECKOUT ? 'Ver e confirmar minha aula' : 'Continuar para pagamento'}
          </ButtonLink>
        ) : request.status === 'searching' ? (
          <>
            {proposed ? (
              <div className="mt-4 rounded-xl border border-brand p-4">
                <h2 className="text-[16px] font-bold text-ink">O instrutor sugeriu outra data</h2>
                <ul className="mt-3 grid gap-2">
                  {proposed.meetings.map((m,i)=><li key={i} className="text-[13px] text-ink">
                    {formatDateLong(m.starts_at)} · {formatTime(m.starts_at)} · {m.hours}h
                  </li>)}
                </ul>
                <p className="mt-2 text-[12px] text-muted">As horas contratadas e o valor estimado são mantidos.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <ActionForm action={respondToSuggestedDate} submitLabel="Aceitar data">
                    <input type="hidden" name="requestId" value={request.id}/>
                    <input type="hidden" name="offerId" value={proposed.id}/>
                    <input type="hidden" name="decision" value="accept"/>
                  </ActionForm>
                  <ActionForm action={respondToSuggestedDate} submitLabel="Recusar e seguir fila" submitVariant="ghost">
                    <input type="hidden" name="requestId" value={request.id}/>
                    <input type="hidden" name="offerId" value={proposed.id}/>
                    <input type="hidden" name="decision" value="decline"/>
                  </ActionForm>
                </div>
              </div>
            ) : null}
            {request.preferred_instructor_id ? <Note className="mt-3">
              O instrutor escolhido recebeu prioridade. Caso recuse ou não responda, outro profissional da fila poderá atender.
            </Note> : null}
            <Note className="mt-5">Cada instrutor tem até 2 minutos para responder.
              A busca dura até 6 minutos. Se não houver aceite, você poderá tentar novos horários.</Note>
            <RequestPoller requestId={request.id}/>
          </>
        ) : (
          <>
            <Note tone="warning" className="mt-5">{cancelled ? 'A solicitação foi cancelada.' : 'Não encontramos um instrutor dentro do prazo da busca.'} Nenhuma cobrança foi feita.</Note>
            <ButtonLink href="/aluno/reservar" className="mt-4">Escolher outros horários</ButtonLink>
          </>
        )}
      </Card>
      </div>
    </div>
  );
}
