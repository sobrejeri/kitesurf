import type { Metadata } from 'next';

import { respondToInstructorOffer } from '@/app/actions/offers';
import { respondBookingReassignment } from '@/app/actions/meeting-change';
import { suggestAlternativeDate } from '@/app/actions/suggestions';
import { ActionForm } from '@/components/action-form';
import { Badge, ButtonLink, Card, Note, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { LEVEL_LABELS, type LessonLevel } from '@/lib/data-labels';
import { formatDateLong, formatTime } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Solicitações de aula' };

interface Offer {
  id: string;
  expires_at: string;
  request: {
    id: string;
    beach_id: string;
    level: LessonLevel;
    language: string;
    total_hours: number;
    meetings: { starts_at: string; hours: number }[];
    with_transport: boolean;
  } | null;
}

export default async function RequestPage() {
  const viewer = await requireRole(['instructor']);
  const db = await createSupabaseServerClient();
  const { data: offers, error } = await db.from('instructor_offers')
    .select('id,expires_at,request:instructor_requests!instructor_offers_request_id_fkey(id,beach_id,level,language,total_hours,meetings,with_transport)')
    .eq('instructor_id',viewer.id).eq('status','offered')
    .gt('expires_at',new Date().toISOString()).order('created_at',{ascending:true}).returns<Offer[]>();
  if (error) return <Note tone="warning">O painel de solicitações ainda depende da migração SQL de ofertas. Verifique a etapa 4.</Note>;
  const transferResponse = await db.rpc('my_booking_reassignment_offers')
    .returns<{
      offer_id:string;booking_code:string;expires_at:string;beach_name:string;
      lesson_level:LessonLevel;lesson_language:string;total_hours:number;
      with_transport:boolean;instructor_net_cents:number;
      meetings:{starts_at:string;hours:number}[];
    }[]>();
  const reassignments = transferResponse.data ?? [];
  const beaches = await db.from('beaches').select('id,name').returns<{id:string;name:string}[]>();
  const names = new Map((beaches.data??[]).map(b=>[b.id,b.name]));
  return (
    <>
      <PageHeader title="Novas solicitações" eyebrow="Sua vez na fila"
        lead="Aceite ou recuse propostas. A recusa e a expiração não alteram sua prioridade." />
      {reassignments.length ? (
        <section className="mb-6 grid gap-3">
          <h2 className="text-[19px] font-bold text-ink">Reservas para assumir · {reassignments.length}</h2>
          <p className="text-[12px] text-muted">
            Reservas já confirmadas, transferidas para a fila. O pagamento e a comissão
            da reserva permanecem inalterados. Confira todos os encontros antes de aceitar.
          </p>
          {reassignments.map(item=>(
            <Card key={item.offer_id} className="max-w-3xl border border-brand">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="text-[16px] font-bold text-ink">{item.booking_code}</h3>
                <Badge tone="warning">Aguardando instrutor</Badge>
              </div>
              <p className="mt-2 text-[13px] text-label">
                {item.beach_name} · {LEVEL_LABELS[item.lesson_level]} ·
                {' '}{item.lesson_language} · {item.total_hours}h
                {item.with_transport ? ' · Transporte incluso' : ''}
              </p>
              <ul className="mt-3 grid gap-1">
                {item.meetings.map((m,i)=><li key={i} className="text-[13px] text-ink">
                  Encontro {i+1}: {formatDateLong(m.starts_at)} às {formatTime(m.starts_at)} · {m.hours}h
                </li>)}
              </ul>
              <p className="mt-2 text-[12px] text-muted">
                Valor previsto para o instrutor nesta reserva: R$ {(item.instructor_net_cents/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}
              </p>
              <p className="mt-2 text-[12px] text-muted">
                Responda até {formatDateLong(item.expires_at)} às {formatTime(item.expires_at)}.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ActionForm action={respondBookingReassignment} submitLabel="Assumir reserva">
                  <input type="hidden" name="offerId" value={item.offer_id}/>
                  <input type="hidden" name="decision" value="accept"/>
                </ActionForm>
                <ActionForm action={respondBookingReassignment} submitLabel="Não posso atender" submitVariant="ghost">
                  <input type="hidden" name="offerId" value={item.offer_id}/>
                  <input type="hidden" name="decision" value="decline"/>
                </ActionForm>
              </div>
            </Card>
          ))}
        </section>
      ) : null}
      {(offers??[]).length === 0 && reassignments.length===0 ? (
        <Card className="py-12 text-center">
          <p className="text-[16px] font-semibold text-ink">Nenhuma proposta aguardando resposta.</p>
          <p className="mt-2 text-[13px] text-muted">Mantenha seu cadastro e disponibilidade atualizados.</p>
          <ButtonLink href="/instrutor/disponibilidade" variant="ghost" className="mt-4">Configurar disponibilidade</ButtonLink>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(offers??[]).map(offer=>offer.request ? (
            <Card key={offer.id} className="max-w-3xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[17px] text-ink">{names.get(offer.request.beach_id)??'Praia cadastrada'}</strong>
                <Badge tone="warning">Aguardando resposta</Badge>
              </div>
              <p className="mt-2 text-[13px] text-muted">
                {LEVEL_LABELS[offer.request.level]} · {offer.request.language} · {offer.request.total_hours} horas
                {offer.request.with_transport ? ' · Com transporte' : ''}
              </p>
              <ul className="mt-4 grid gap-2">
                {offer.request.meetings.map((m,i)=><li key={i} className="text-[13px] text-ink">
                  {formatDateLong(m.starts_at)} · {formatTime(m.starts_at)} · {m.hours}h
                </li>)}
              </ul>
              <p className="mt-3 text-[12px] text-muted">
                Prazo de resposta: {new Intl.DateTimeFormat('pt-BR', { timeZone:'America/Fortaleza',timeStyle:'short' }).format(new Date(offer.expires_at))}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <ActionForm action={respondToInstructorOffer} submitLabel="Aceitar aula">
                  <input type="hidden" name="offerId" value={offer.id}/>
                  <input type="hidden" name="response" value="accept"/>
                </ActionForm>
                <ActionForm action={respondToInstructorOffer} submitLabel="Recusar" submitVariant="ghost">
                  <input type="hidden" name="offerId" value={offer.id}/>
                  <input type="hidden" name="response" value="decline"/>
                </ActionForm>
              </div>
              <details className="mt-4 rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-[13px] font-semibold text-brand">Não consigo nessa data · sugerir outra</summary>
                <ActionForm action={suggestAlternativeDate} submitLabel="Enviar sugestão ao aluno" className="mt-4 grid gap-3">
                  <input type="hidden" name="offerId" value={offer.id}/>
                  <input type="hidden" name="totalHours" value={offer.request.total_hours}/>
                  <label htmlFor={'alternative-'+offer.id} className="text-[13px] font-semibold text-ink">Nova data e horário</label>
                  <input id={'alternative-'+offer.id} name="start" type="datetime-local" required
                    className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-[13px] text-ink"/>
                  <p className="text-[12px] text-muted">A proposta manterá as {offer.request.total_hours}h da contratação.
                    O aluno precisará aceitar antes de você confirmar.</p>
                </ActionForm>
              </details>
            </Card>
          ):null)}
        </div>
      )}
    </>
  );
}
