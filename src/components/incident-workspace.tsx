import { reportLessonIncident, reviewLessonIncident } from '@/app/actions/incidents';
import { ActionForm } from '@/components/action-form';
import { Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole, type AppRole } from '@/lib/auth';
import { listBookingsForInstructor, listBookingsForStudent } from '@/lib/data';
import { formatDateLong, formatTime } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Incident = {
  id:string;booking_id:string;meeting_id:string;incident_type:string;
  minutes_done:number;status:string;description:string;
  resolution:string|null;created_at:string;
};

const TYPES:Record<string,string>={
  weather:'Condições do vento',absence:'Ausência',equipment:'Equipamento',
  safety:'Segurança',other:'Outro motivo',
};
const STATUSES:Record<string,string>={
  open:'Aberta',reviewing:'Em análise',resolved:'Resolvida',rejected:'Não procedente',
};

export async function IncidentWorkspace({area}:{area:'aluno'|'instrutor'|'admin'}) {
  const role:AppRole=area==='aluno'?'student':area==='instrutor'?'instructor':'admin';
  const viewer=await requireRole([role]);
  const db=await createSupabaseServerClient();
  const admin=area==='admin';
  const [records,bookings]=await Promise.all([
    db.from('booking_incidents').select('id,booking_id,meeting_id,incident_type,minutes_done,status,description,resolution,created_at')
      .order('created_at',{ascending:false}).limit(100).returns<Incident[]>(),
    admin?Promise.resolve([]):area==='aluno'?listBookingsForStudent(viewer.id):listBookingsForInstructor(viewer.id),
  ]);
  const meetings=bookings.filter(b=>b.status==='confirmed'||b.status==='completed')
    .flatMap(b=>b.booking_meetings.map(m=>({id:m.id,bookingId:b.id,code:('code' in b && typeof b.code==='string' ? b.code : b.id.slice(0,8)),startsAt:m.starts_at,minutes:m.minutes})));
  return (
    <>
      <PageHeader eyebrow="Cada situação acompanhada" title={admin?'Analisar ocorrências':'Imprevistos e ocorrências'}
        lead="As ocorrências são registradas para análise; nenhuma decisão altera automaticamente o pagamento ou os encontros."/>
      {records.error?<Note tone="warning">O módulo de ocorrências depende da migração 15 no Supabase.</Note>:null}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {!admin?(
          <Card>
            <h2 className="text-[17px] font-bold text-ink">Registrar imprevisto</h2>
            {meetings.length===0?<p className="mt-3 text-[13px] text-muted">Você ainda não tem encontros confirmados para relatar.</p>:(
              <ActionForm action={reportLessonIncident} submitLabel="Enviar ocorrência" className="mt-4 grid gap-3">
                <label htmlFor="incident-meeting" className="text-[13px] font-semibold">Encontro</label>
                <select id="incident-meeting" name="meeting" required className={inputClass}>
                  {meetings.map(m=><option key={m.id} value={m.bookingId+':'+m.id}>
                    {m.code} · {formatDateLong(m.startsAt)} · {formatTime(m.startsAt)}
                  </option>)}
                </select>
                <label htmlFor="incident-type" className="text-[13px] font-semibold">O que aconteceu?</label>
                <select id="incident-type" name="type" required className={inputClass}>
                  {Object.entries(TYPES).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                </select>
                <label htmlFor="incident-minutes" className="text-[13px] font-semibold">Minutos realizados</label>
                <input id="incident-minutes" name="minutes" type="number" min={0} max={480} defaultValue={0} className={inputClass} required/>
                <label htmlFor="incident-description" className="text-[13px] font-semibold">Descrição da situação</label>
                <textarea id="incident-description" name="description" minLength={10} maxLength={1000} rows={4}
                  required className={inputClass} placeholder="Descreva objetivamente o que aconteceu."/>
              </ActionForm>
            )}
          </Card>
        ):null}
        <Card>
          <h2 className="text-[17px] font-bold text-ink">{admin?'Solicitações recebidas':'Histórico de ocorrências'}</h2>
          {(records.data??[]).length===0?<p className="mt-4 text-[13px] text-muted">Nenhuma ocorrência registrada.</p>:(
            <ul className="mt-3 divide-y divide-line">
              {(records.data??[]).map(x=>(
                <li key={x.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[13px] text-ink">{TYPES[x.incident_type]??x.incident_type}</strong>
                    <span className="text-[12px] font-semibold text-brand">{STATUSES[x.status]??x.status}</span>
                  </div>
                  <p className="mt-1 break-words text-[13px] text-muted">{x.description}</p>
                  <p className="mt-2 text-[11px] text-label">Minutos informados: {x.minutes_done} · {new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short'}).format(new Date(x.created_at))}</p>
                  {x.resolution?<p className="mt-2 rounded-xl bg-brand-soft p-3 text-[12px] text-ink">Resposta da administração: {x.resolution}</p>:null}
                  {admin?(
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[13px] font-semibold text-brand">Analisar esta ocorrência</summary>
                      <ActionForm action={reviewLessonIncident} submitLabel="Registrar decisão" className="mt-3 grid gap-3">
                        <input type="hidden" name="id" value={x.id}/>
                        <select name="status" defaultValue="reviewing" className={inputClass}>
                          <option value="reviewing">Em análise</option>
                          <option value="resolved">Resolvida</option>
                          <option value="rejected">Não procedente</option>
                        </select>
                        <textarea name="resolution" required rows={3} minLength={5} maxLength={1000}
                          className={inputClass} placeholder="Explique sua decisão."/>
                      </ActionForm>
                    </details>
                  ):null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
