import type { Metadata } from 'next';

import { Card, Note, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Minhas avaliações' };

interface Feedback { id: string; stars: number; comment: string; created_at: string }

export default async function InstructorRatingsPage() {
  const viewer = await requireRole(['instructor']);
  const db = await createSupabaseServerClient();
  const {data,error}=await db.from('instructor_ratings')
    .select('id,stars,comment,created_at')
    .eq('instructor_id',viewer.id).order('created_at',{ascending:false}).limit(100)
    .returns<Feedback[]>();
  const count=(data??[]).length;
  const average=count?((data??[]).reduce((sum,r)=>sum+r.stars,0)/count).toFixed(1):'—';
  return (
    <>
      <PageHeader eyebrow="Experiência dos alunos" title="Minhas avaliações"
        lead="Somente alunos que concluíram suas aulas podem registrar avaliações verificadas."/>
      {error?<Note tone="warning">As avaliações dependem da migração 12 do Supabase.</Note>: (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Card>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-label">Média das avaliações exibidas</p>
            <strong className="mt-3 block text-[40px] font-extrabold text-brand">{average} ★</strong>
            <p className="mt-2 text-[12px] text-muted">{count} {count===1?'avaliação exibida':'avaliações exibidas'} (últimas 100)</p>
          </Card>
          <Card>
            <h2 className="text-[17px] font-bold text-ink">Comentários dos alunos</h2>
            {count===0?<p className="mt-4 text-[13px] text-muted">Você ainda não recebeu avaliações.</p>: (
              <ul className="mt-4 divide-y divide-line">
                {(data??[]).map(r=>(
                  <li key={r.id} className="py-4">
                    <span className="text-[17px] font-semibold text-brand">{'★'.repeat(r.stars)}{'☆'.repeat(5-r.stars)}</span>
                    {r.comment?<p className="mt-2 break-words text-[13px] leading-relaxed text-ink">{r.comment}</p>:null}
                    <time dateTime={r.created_at} className="mt-1 block text-[11px] text-muted">
                      {new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'medium'}).format(new Date(r.created_at))}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
