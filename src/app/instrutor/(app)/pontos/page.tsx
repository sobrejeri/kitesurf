import type { Metadata } from 'next';

import { chooseMeetingPoint } from '@/app/actions/meeting-points';
import { ActionForm } from '@/components/action-form';
import { Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listBookingsForInstructor } from '@/lib/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata:Metadata={title:'Pontos de encontro'};
type Point={id:string;beach_id:string;title:string;details:string;active:boolean};

export default async function InstructorMeetingPointsPage() {
  const viewer=await requireRole(['instructor']);
  const db=await createSupabaseServerClient();
  const [bookings,points]=await Promise.all([
    listBookingsForInstructor(viewer.id),
    db.from('meeting_points').select('id,beach_id,title,details,active').eq('active',true)
      .returns<Point[]>(),
  ]);
  return (
    <>
      <PageHeader eyebrow="Orientações aos alunos" title="Pontos de encontro"
        lead="Escolha um local aprovado para cada reserva confirmada, antes de iniciar a aula."/>
      {points.error?<Note tone="warning">Os pontos de encontro dependem da migração 19 no Supabase.</Note>:(
        <div className="grid gap-3">
          {bookings.filter(b=>b.status==='confirmed').length===0?
            <Card><p className="text-[13px] text-muted">Nenhuma aula confirmada para definir o encontro.</p></Card>:null}
          {bookings.filter(b=>b.status==='confirmed').map(b=>{
            const matching=(points.data??[]).filter(p=>p.beach_id===b.beach_id);
            return <Card key={b.id}>
              <h2 className="text-[16px] font-bold text-ink">{b.student?.full_name??'Aluno'} · {b.beach?.name??'Praia'}</h2>
              <p className="mt-1 text-[12px] text-muted">Reserva {b.code}</p>
              {matching.length===0?<Note tone="warning" className="mt-3">A administração ainda não cadastrou um ponto ativo nesta praia.</Note>:(
                <ActionForm action={chooseMeetingPoint} submitLabel="Confirmar ponto de encontro" className="mt-4 grid gap-3">
                  <input type="hidden" name="bookingId" value={b.id}/>
                  <label htmlFor={'point-'+b.id}>Onde encontrar o aluno</label>
                  <select id={'point-'+b.id} name="pointId" required className={inputClass}>
                    {matching.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </ActionForm>
              )}
            </Card>;
          })}
        </div>
      )}
    </>
  );
}
