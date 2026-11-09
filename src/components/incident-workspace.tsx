import { reportLessonIncident, reviewLessonIncident } from '@/app/actions/incidents';
import { ActionForm } from '@/components/action-form';
import { Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole, type AppRole } from '@/lib/auth';
import { listBookingsForInstructor, listBookingsForStudent } from '@/lib/data';
import { formatDateLong, formatTime } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProtectionMonitor } from '@/components/protection-monitor';
import { listProtectionMonitorItems } from '@/lib/protection-monitor';
import { summarizeVisibleProtectionReports } from '@/lib/protection-report-summary';
import { ProtectionStatementsWorkspace } from '@/components/protection-statements-workspace';
import { ProtectionCaseArchive } from '@/components/protection-case-archive';
import { parseProtectionArchiveParams } from '@/lib/protection-archive-pagination';

type Incident = {
  id:string;booking_id:string;meeting_id:string;reported_by:string;incident_type:string;
  minutes_done:number;status:string;description:string;
  resolution:string|null;created_at:string;
};

type AdminMeeting = { id: string; booking_id: string; starts_at: string; minutes: number; status: string };
type AdminBooking = { id: string; code: string; status: string; is_test: boolean; student_id: string; instructor_id: string | null };

const TYPES:Record<string,string>={
  weather:'Condições do vento',absence:'Ausência',equipment:'Equipamento',
  safety:'Segurança',other:'Outro motivo',
};
const STATUSES:Record<string,string>={
  open:'Aberta',reviewing:'Em análise',resolved:'Resolvida',rejected:'Não procedente',
};

export async function IncidentWorkspace({area,title,searchParams}:{
  area:'aluno'|'instrutor'|'admin'; title?:string;
  searchParams?:Readonly<Record<string,string|string[]|undefined>>;
}) {
  const role:AppRole=area==='aluno'?'student':area==='instrutor'?'instructor':'admin';
  const viewer=await requireRole([role]);
  const db=await createSupabaseServerClient();
  const admin=area==='admin';
  const nowMs=Date.now();
  const [records,bookings]=await Promise.all([
    db.from('booking_incidents').select('id,booking_id,meeting_id,reported_by,incident_type,minutes_done,status,description,resolution,created_at')
      .order('created_at',{ascending:false}).limit(100).returns<Incident[]>(),
    admin?Promise.resolve([]):area==='aluno'?listBookingsForStudent(viewer.id):listBookingsForInstructor(viewer.id),
  ]);
  const meetings=bookings.filter(b=>b.status==='confirmed'||b.status==='completed')
    .flatMap(b=>b.booking_meetings.map(m=>({
      id:m.id,bookingId:b.id,code:b.code,startsAt:m.starts_at,minutes:m.minutes,
      bookingStatus:b.status,meetingStatus:m.status,isTest:b.is_test,
    })));

  // Admin monitoring is a bounded, read-only lookup. It also finds meetings
  // nobody reported. No check-in, incident, notification or payout is created.
  const adminMeetingRead=admin ? await db.from('booking_meetings')
    .select('id,booking_id,starts_at,minutes,status')
    .eq('status','scheduled')
    .gte('starts_at',new Date(nowMs-45*24*60*60*1000).toISOString())
    .lte('starts_at',new Date(nowMs).toISOString())
    .order('starts_at',{ascending:true})
    .limit(100).returns<AdminMeeting[]>() : null;
  const adminBookingIds=[...new Set((adminMeetingRead?.data??[]).map(m=>m.booking_id))];
  const adminBookingRead=admin && adminBookingIds.length ? await db.from('bookings')
    .select('id,code,status,is_test,student_id,instructor_id')
    .in('id',adminBookingIds).returns<AdminBooking[]>() : null;
  const adminBookingMap=new Map((adminBookingRead?.data??[]).map(b=>[b.id,b] as const));
  const protectionSource=admin
    ? (adminMeetingRead?.data??[]).flatMap(m=>{
        const b=adminBookingMap.get(m.booking_id);
        if(!b)return [];
        return [{
          id:m.id, bookingId:b.id, bookingCode:b.code, bookingStatus:b.status,
          meetingStatus:m.status, startsAt:m.starts_at, minutes:m.minutes, isTest:b.is_test,
        }];
      })
    : meetings.map(m=>({
        id:m.id, bookingId:m.bookingId, bookingCode:m.code, bookingStatus:m.bookingStatus,
        meetingStatus:m.meetingStatus, startsAt:m.startsAt, minutes:m.minutes, isTest:m.isTest,
      }));
  const protectionItems=listProtectionMonitorItems(protectionSource,nowMs);
  const reportSummaries=summarizeVisibleProtectionReports(records.data??[],viewer.id);
  // The history query is limited to recent entries. Codes are fetched solely
  // for records visible under existing RLS; no extra incident is exposed.
  const incidentBookingIds=admin?[...new Set((records.data??[]).map(x=>x.booking_id))]:[];
  const incidentBookingRead=admin&&incidentBookingIds.length
    ? await db.from('bookings').select('id,code').in('id',incidentBookingIds)
      .returns<Array<{id:string;code:string}>>()
    : null;
  const bookingCodes=new Map<string,string>([
    ...bookings.map(b=>[b.id,b.code] as const),
    ...(incidentBookingRead?.data??[]).map(b=>[b.id,b.code] as const),
  ]);
  return (
    <>
      <PageHeader eyebrow="Cada situação acompanhada" title={title ?? (admin?'Analisar ocorrências':'Imprevistos e ocorrências')}
        lead="VentoKite Protege: acompanhe encontros sem registro, apresente relatos e confira as análises. Nenhuma ação financeira é automática."/>
      {records.error?<Note tone="warning">Não foi possível consultar as ocorrências. Tente novamente ou informe ao suporte.</Note>:null}
      <ProtectionMonitor items={protectionItems} area={area} reports={reportSummaries}
        error={Boolean(adminMeetingRead?.error || adminBookingRead?.error || records.error)}/>
      <ProtectionCaseArchive area={area} viewerId={viewer.id}
        params={parseProtectionArchiveParams(searchParams??{})}/>
      <ProtectionStatementsWorkspace area={area} viewerId={viewer.id}
        items={protectionItems} legacyIncidents={(records.data??[]).map(x=>({
          meetingId:x.meeting_id,bookingId:x.booking_id,createdAt:x.created_at,
        }))}/>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {!admin?(
          <div id="registrar-ocorrencia" className="scroll-mt-24"><Card>
            <h2 className="text-[17px] font-bold text-ink">Registrar imprevisto</h2>
            <p className="mt-2 text-[12px] text-muted">
              Descreva o que ocorreu e informe somente os minutos efetivamente realizados.
              O relato não registra presença nem conclui a aula. Você também pode
              apresentar esclarecimentos após o prazo interno de cinco dias.
            </p>
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
          </Card></div>
        ):null}
        <div id="historico-ocorrencias" className="scroll-mt-24"><Card>
          <h2 className="text-[17px] font-bold text-ink">{admin?'Solicitações recebidas':'Histórico de ocorrências'}</h2>
          {admin?<Note className="mt-3">
            Resolver uma ocorrência aqui apenas registra a justificativa administrativa.
            Não aprova pagamento, repasse, reembolso nem créditos de horas.
          </Note>:null}
          {(records.data??[]).length===0?<p className="mt-4 text-[13px] text-muted">Nenhuma ocorrência registrada.</p>:(
            <ul className="mt-3 divide-y divide-line">
              {(records.data??[]).map(x=>(
                <li key={x.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[13px] text-ink">{TYPES[x.incident_type]??x.incident_type}</strong>
                    <span className="text-[12px] font-semibold text-brand">{STATUSES[x.status]??x.status}</span>
                  </div>
                  <p className="mt-1 text-[12px] font-medium text-muted">
                    Reserva {bookingCodes.get(x.booking_id)??'sem código disponível'}
                    {' · '}{admin?'Relato de participante':x.reported_by===viewer.id?'Relato enviado por você':'Relato de outro participante'}
                  </p>
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
        </Card></div>
      </div>
    </>
  );
}
