import type { Metadata } from 'next';

import { respondToInstructorOffer } from '@/app/actions/offers';
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
  const beaches = await db.from('beaches').select('id,name').returns<{id:string;name:string}[]>();
  const names = new Map((beaches.data??[]).map(b=>[b.id,b.name]));
  return (
    <>
      <PageHeader title="Novas solicitações" eyebrow="Sua vez na fila"
        lead="Aceite ou recuse propostas. A recusa e a expiração não alteram sua prioridade." />
      {(offers??[]).length === 0 ? (
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
            </Card>
          ):null)}
        </div>
      )}
    </>
  );
}
