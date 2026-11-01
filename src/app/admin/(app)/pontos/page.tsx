import type { Metadata } from 'next';

import { createMeetingPoint, toggleMeetingPoint } from '@/app/actions/meeting-points';
import { ActionForm } from '@/components/action-form';
import { Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listActiveBeaches } from '@/lib/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata:Metadata={title:'Pontos de encontro'};
type Point={id:string;beach_id:string;title:string;details:string;latitude:number;longitude:number;active:boolean};

export default async function MeetingPointsPage() {
  await requireRole(['admin']);
  const [beaches,db]=await Promise.all([listActiveBeaches(),createSupabaseServerClient()]);
  const {data,error}=await db.from('meeting_points')
    .select('id,beach_id,title,details,latitude,longitude,active')
    .order('created_at',{ascending:false}).limit(100).returns<Point[]>();
  return (
    <>
      <PageHeader eyebrow="Locais aprovados pela operação" title="Pontos de encontro"
        lead="Cadastre uma referência e coordenadas confirmadas. O instrutor escolherá um dos pontos da praia da reserva."/>
      {error?<Note tone="warning">O cadastro real depende da migração 19 no Supabase.</Note>:(
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-[17px] font-bold text-ink">Cadastrar novo ponto</h2>
            <ActionForm action={createMeetingPoint} submitLabel="Salvar localização" className="mt-4 grid gap-3">
              <label htmlFor="point-beach">Praia</label>
              <select id="point-beach" name="beachId" className={inputClass} required>
                {beaches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <label htmlFor="point-title">Referência</label>
              <input id="point-title" name="title" maxLength={100} minLength={2} required className={inputClass}
                placeholder="Ex.: Entrada principal da praia"/>
              <label htmlFor="point-details">Orientações para encontrar</label>
              <textarea id="point-details" name="details" maxLength={400} rows={3} className={inputClass}/>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="point-lat">Latitude</label>
                  <input id="point-lat" name="latitude" required type="number" step="0.000001" min={-90} max={90} className={inputClass}/></div>
                <div><label htmlFor="point-lon">Longitude</label>
                  <input id="point-lon" name="longitude" required type="number" step="0.000001" min={-180} max={180} className={inputClass}/></div>
              </div>
            </ActionForm>
          </Card>
          <Card>
            <h2 className="text-[17px] font-bold text-ink">Locais cadastrados</h2>
            {(data??[]).length===0?<p className="mt-3 text-[13px] text-muted">Nenhum local cadastrado.</p>:(
              <ul className="mt-3 divide-y divide-line">
                {(data??[]).map(p=>(
                  <li key={p.id} className="py-3">
                    <strong className="block text-[13px] text-ink">{p.title}</strong>
                    <span className="text-[11px] text-muted">{p.latitude}, {p.longitude} · {p.active?'Ativo':'Inativo'}</span>
                    <ActionForm action={toggleMeetingPoint} submitLabel={p.active?'Desativar':'Ativar'} submitVariant="ghost" className="mt-2">
                      <input type="hidden" name="id" value={p.id}/>
                      <input type="hidden" name="active" value={p.active?'false':'true'}/>
                    </ActionForm>
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
