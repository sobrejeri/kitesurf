import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { RequestPoller } from '@/components/student/request-poller';
import { Badge, ButtonLink, Card, Note, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  const { data: price } = await db.from('price_versions')
    .select('hourly_rate_cents').eq('id', request.price_version_id)
    .maybeSingle<{ hourly_rate_cents: number }>();
  const accepted = request.status === 'accepted' && Boolean(request.booking_id);
  return (
    <>
      <PageHeader eyebrow="Sua solicitação" title={accepted ? 'Instrutor encontrado!' : 'Procurando seu instrutor'}
        lead={accepted ? 'Sua aula foi aceita. Agora é só concluir o pagamento de teste.' :
          'Enviamos a proposta aos profissionais compatíveis, seguindo a fila de atendimento.'}/>
      <Card className="max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <strong className="text-[17px] text-ink">{request.total_hours}h de kitesurf</strong>
          <Badge tone={accepted ? 'success' : 'warning'}>
            {accepted ? 'Aceita' : request.status==='searching' ? 'Buscando' : 'Encerrada'}
          </Badge>
        </div>
        {price ? <p className="mt-2 text-[13px] text-muted">
          Aula: {formatMoney(price.hourly_rate_cents * request.total_hours)}. Transporte, quando escolhido, entra no resumo de pagamento.
        </p> : null}
        {accepted && request.booking_id ? (
          <ButtonLink href={'/aluno/reserva/' + request.booking_id} className="mt-5 w-full">
            Continuar para pagamento
          </ButtonLink>
        ) : request.status === 'searching' ? (
          <>
            {request.preferred_instructor_id ? <Note className="mt-3">
              O instrutor escolhido recebeu prioridade. Caso recuse ou não responda, outro profissional da fila poderá atender.
            </Note> : null}
            <Note className="mt-5">Cada instrutor tem até 2 minutos para responder.
              A busca dura até 6 minutos. Se não houver aceite, você poderá tentar novos horários.</Note>
            <RequestPoller requestId={request.id}/>
          </>
        ) : (
          <>
            <Note tone="warning" className="mt-5">Não encontramos um instrutor dentro do prazo da busca. Nenhuma cobrança foi feita.</Note>
            <ButtonLink href="/aluno/reservar" className="mt-4">Escolher outros horários</ButtonLink>
          </>
        )}
      </Card>
    </>
  );
}
