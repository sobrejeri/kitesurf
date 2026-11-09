import { ActionForm } from '@/components/action-form';
import { Card, Note, inputClass, textareaClass } from '@/components/ui';
import { EvidenceUpload } from '@/components/protection-evidence-upload';
import {
  submitProtectionStatement, reviewProtectionStatement,
} from '@/app/actions/protection-statements';
import {
  PROTECTION_DECLARATIONS, PROTECTION_ASSESSMENTS, protectionStage3Enabled,
} from '@/lib/protection-stage3';
import {
  selectVisibleProtectionCaseIds, protectionCaseCanAcceptStatement,
  type ProtectionCaseReference,
} from '@/lib/protection-case-history';
import type { ProtectionMonitorItem } from '@/lib/protection-monitor';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type ProtectionStatement = {
  id:string; booking_id:string; meeting_id:string; author_id:string; version:number;
  declaration:string; claimed_minutes:number; narrative:string; created_at:string;
};
type ProtectionReview = {
  id:string; meeting_id:string; admin_id:string; assessment:string;
  rationale:string; created_at:string;
};
type ProtectionEvidence = {
  id:string; statement_id:string; uploader_id:string; object_path:string;
  original_name:string; mime_type:string; bytes:number; confirmed:boolean;
};
type CaseMeeting = {id:string; booking_id:string; starts_at:string; minutes:number; status:string};
type CaseBooking = {id:string;code:string;status:string;is_test:boolean;student_id:string;instructor_id:string|null};

const dateLabel=(iso:string)=>new Intl.DateTimeFormat('pt-BR',{
  dateStyle:'short',timeStyle:'short',timeZone:'America/Fortaleza',
}).format(new Date(iso));

/**
 * The history is discovered independently from the overdue monitor.
 * RLS still controls every statement, meeting, booking, review and proof.
 * Bounded newest-first pages are not evidence that older reports don't exist.
 */
export async function ProtectionStatementsWorkspace({
  area,viewerId,items,legacyIncidents,
}:{
  area:'aluno'|'instrutor'|'admin';
  viewerId:string;
  items:readonly ProtectionMonitorItem[];
  legacyIncidents:readonly (ProtectionCaseReference&{bookingId:string})[];
}) {
  if(!protectionStage3Enabled())return null;
  const admin=area==='admin';
  const db=await createSupabaseServerClient();
  const statementsResult=await db.from('lesson_protection_statements')
    .select('id,booking_id,meeting_id,author_id,version,declaration,claimed_minutes,narrative,created_at')
    .order('created_at',{ascending:false}).limit(100).returns<ProtectionStatement[]>();
  const recentStatements=statementsResult.data??[];
  const monitorById=new Map(items.map(m=>[m.id,m]));
  const ids=selectVisibleProtectionCaseIds(
    items.map(m=>m.id),
    [
      ...recentStatements.map(s=>({meetingId:s.meeting_id,createdAt:s.created_at})),
      ...legacyIncidents,
    ],
  );
  if(!ids.length && !statementsResult.error)return null;
  const [meetingResult,reviewsResult,evidenceResult]=ids.length?await Promise.all([
    db.from('booking_meetings')
      .select('id,booking_id,starts_at,minutes,status')
      .in('id',ids).returns<CaseMeeting[]>(),
    db.from('lesson_protection_reviews')
      .select('id,meeting_id,admin_id,assessment,rationale,created_at')
      .in('meeting_id',ids).order('created_at',{ascending:false})
      .limit(200).returns<ProtectionReview[]>(),
    db.from('lesson_protection_evidence')
      .select('id,statement_id,uploader_id,object_path,original_name,mime_type,bytes,confirmed')
      .in('meeting_id',ids).eq('confirmed',true)
      .order('created_at',{ascending:false}).limit(200).returns<ProtectionEvidence[]>(),
  ]):[
    {data:[] as CaseMeeting[],error:null},
    {data:[] as ProtectionReview[],error:null},
    {data:[] as ProtectionEvidence[],error:null},
  ];
  const meetings=new Map((meetingResult.data??[]).map(m=>[m.id,m]));
  const bookingIds=[...new Set([
    ...(meetingResult.data??[]).map(m=>m.booking_id),
    ...recentStatements.map(s=>s.booking_id),
    ...legacyIncidents.map(i=>i.bookingId),
  ])];
  const bookingsResult=bookingIds.length?await db.from('bookings')
    .select('id,code,status,is_test,student_id,instructor_id')
    .in('id',bookingIds).returns<CaseBooking[]>()
    :{data:[] as CaseBooking[],error:null};
  const bookings=new Map((bookingsResult.data??[]).map(b=>[b.id,b]));
  const reviews=reviewsResult.data??[];
  const evidence=evidenceResult.data??[];
  const readError=Boolean(statementsResult.error||meetingResult.error||
    reviewsResult.error||evidenceResult.error||bookingsResult.error);
  const proofUrls=new Map<string,string>();
  if(!readError){
    const visibleStatementIds=new Set(recentStatements.map(s=>s.id));
    // Proofs are RLS-visible only to their uploader and Admin. Signed URLs
    // expire after five minutes and are never issued for pending evidence.
    for(const item of evidence.filter(e=>visibleStatementIds.has(e.statement_id)).slice(0,24)){
      const {data}=await db.storage.from('vento-protection-evidence')
        .createSignedUrl(item.object_path,300);
      if(data?.signedUrl)proofUrls.set(item.id,data.signedUrl);
    }
  }

  return <Card className="mb-5">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">Etapa 3B · VentoKite Protege</p>
    <h2 className="mt-1 text-[18px] font-bold text-ink">Manifestações e histórico dos encontros</h2>
    <p className="mt-2 text-[12px] leading-relaxed text-muted">
      Uma aula concluída ou cancelada deixa de aparecer no monitor de atrasos,
      mas suas ocorrências e manifestações continuam neste histórico.
      As versões anteriores são preservadas e não autorizam pagamentos.
    </p>
    {readError?<Note tone="warning" className="mt-3">
      Não foi possível carregar todo o histórico. Nenhuma ausência de registro
      nesta consulta pode ser interpretada como falta de resposta.
    </Note>:null}
    <div className="mt-4 grid gap-3">
      {ids.map(id=>{
        const meeting=meetings.get(id);
        const monitor=monitorById.get(id);
        const caseStatements=recentStatements.filter(s=>s.meeting_id===id);
        const bookingId=meeting?.booking_id??caseStatements[0]?.booking_id??
          legacyIncidents.find(i=>i.meetingId===id)?.bookingId;
        const booking=bookingId?bookings.get(bookingId):undefined;
        const started=meeting?.starts_at??monitor?.startsAt??null;
        const duration=meeting?.minutes??monitor?.minutes??null;
        const decisions=reviews.filter(r=>r.meeting_id===id);
        const own=caseStatements.find(s=>s.author_id===viewerId);
        const canSubmit=!readError&&protectionCaseCanAcceptStatement({
          area,viewerId,studentId:booking?.student_id??null,
          instructorId:booking?.instructor_id??null,
          bookingStatus:booking?.status??null,startsAt:started,minutes:duration,
          nowMs:Date.now(),
        });
        const history=!monitor;
        const priorIncidentCount=legacyIncidents.filter(i=>i.meetingId===id).length;
        const title=booking?.code??monitor?.bookingCode??`Encontro ${id.slice(0,8)}`;
        const partyLabel=(author:string)=>{
          if(author===viewerId)return 'Você';
          if(author===booking?.student_id)return 'Aluno';
          if(author===booking?.instructor_id)return 'Instrutor';
          return 'Participante anterior';
        };
        return <details key={id} className="rounded-xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">
            {title}{history?' · Histórico':' · Acompanhamento'}
            <span className="ml-2 text-[11px] font-normal text-muted">
              {started?dateLabel(started):'Data indisponível'}
              {duration!==null?` · ${duration} minutos`:''}
              {booking?.is_test?' · Aula de teste':''}
            </span>
          </summary>
          <div className="mt-4 grid gap-4">
            {history?<Note>
              Este encontro não está no monitor de aulas vencidas. O histórico
              permanece consultável, sem reabrir automaticamente a aula,
              reter ou liberar valores.
            </Note>:null}
            {priorIncidentCount>0?<p className="text-[12px] text-muted">
              {priorIncidentCount} ocorrência(s) no histórico anterior.
              <a href="#historico-ocorrencias" className="ml-1 text-brand underline">
                Ver registros disponíveis
              </a>
            </p>:null}
            {!caseStatements.length?<p className="text-[12px] text-muted">
              Nenhuma manifestação estruturada encontrada nos registros recentes
              acessíveis nesta consulta.
            </p>:caseStatements.map(s=><div key={s.id}
                className="rounded-xl border border-line bg-brand-wash px-3 py-3">
              <p className="text-[12px] font-semibold text-ink">
                {partyLabel(s.author_id)} · versão {s.version}
              </p>
              <p className="mt-1 text-[12px] text-muted">
                {PROTECTION_DECLARATIONS[s.declaration as keyof typeof PROTECTION_DECLARATIONS]
                  ??'Manifestação'} · {s.claimed_minutes} minuto(s) informados
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-[12px] text-ink">{s.narrative}</p>
              <p className="mt-1 text-[11px] text-muted">{dateLabel(s.created_at)}</p>
              {evidence.filter(e=>e.statement_id===s.id).map(e=>(
                <p className="mt-2 text-[12px]" key={e.id}>
                  {proofUrls.has(e.id)
                    ? <a className="font-medium text-brand underline" href={proofUrls.get(e.id)}
                      target="_blank" rel="noopener noreferrer">Prova privada: {e.original_name}</a>
                    : <span className="text-muted">Arquivo restrito ao autor e ao Admin</span>}
                </p>
              ))}
            </div>)}
            {!admin&&canSubmit?<div className="rounded-xl border border-line px-4 py-4">
              <h3 className="text-[13px] font-bold text-ink">
                {own?'Adicionar nova versão do seu relato':'Enviar sua manifestação'}
              </h3>
              <ActionForm action={submitProtectionStatement} submitLabel="Registrar minha versão"
                className="mt-3 grid gap-3">
                <input type="hidden" name="meeting" value={id}/>
                <input type="hidden" name="scheduledMinutes" value={duration??0}/>
                <label htmlFor={'declaration-'+id} className="text-[12px] font-semibold">
                  Como foi o encontro?
                </label>
                <select id={'declaration-'+id} name="declaration" className={inputClass} required>
                  {Object.entries(PROTECTION_DECLARATIONS).map(([key,label])=>
                    <option value={key} key={key}>{label}</option>)}
                </select>
                <label htmlFor={'minutes-'+id} className="text-[12px] font-semibold">
                  Minutos que você afirma terem sido realizados
                </label>
                <input id={'minutes-'+id} type="number" name="claimedMinutes"
                  min={0} max={duration??0} defaultValue={duration??0}
                  required className={inputClass}/>
                <p className="text-[11px] text-muted">
                  Informe 0 para aula não realizada, ausência ou risco;
                  o total para realização integral e valor intermediário para aula parcial.
                </p>
                <label htmlFor={'narrative-'+id} className="text-[12px] font-semibold">
                  Sua justificativa
                </label>
                <textarea id={'narrative-'+id} name="narrative" rows={4}
                  minLength={20} maxLength={2000} required className={textareaClass}
                  placeholder="Descreva o que aconteceu, horários e tentativas de contato."/>
              </ActionForm>
            </div>:null}
            {!admin&&own?<EvidenceUpload area={area} statementId={own.id}/>:null}
            {decisions.map(d=><div key={d.id} className="rounded-xl border border-line px-3 py-3">
              <p className="text-[12px] font-semibold text-ink">
                Registro da administração · {dateLabel(d.created_at)}
              </p>
              <p className="mt-1 text-[12px] text-brand">
                {PROTECTION_ASSESSMENTS[d.assessment as keyof typeof PROTECTION_ASSESSMENTS]??'Avaliação'}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-[12px] text-ink">{d.rationale}</p>
            </div>)}
            {admin&&caseStatements.length>0&&meeting&&!readError?
              <ActionForm action={reviewProtectionStatement}
                submitLabel="Registrar avaliação administrativa" className="grid gap-3">
                <input type="hidden" name="meeting" value={id}/>
                <label className="text-[12px] font-semibold" htmlFor={'assessment-'+id}>
                  Encaminhamento
                </label>
                <select name="assessment" id={'assessment-'+id} className={inputClass}>
                  {Object.entries(PROTECTION_ASSESSMENTS).map(([key,label])=>
                    <option key={key} value={key}>{label}</option>)}
                </select>
                <label className="text-[12px] font-semibold" htmlFor={'rationale-'+id}>
                  Fundamentação (não movimenta dinheiro)
                </label>
                <textarea name="rationale" id={'rationale-'+id} rows={4}
                  minLength={20} maxLength={2000} required className={textareaClass}/>
              </ActionForm>:null}
          </div>
        </details>;
      })}
    </div>
    {recentStatements.length===100||ids.length===120?<Note tone="warning" className="mt-3">
      Exibição limitada aos registros mais recentes. Casos antigos não
      encontrados nesta página devem ser consultados pelo suporte.
    </Note>:null}
    <Note className="mt-4">
      O prazo de cinco dias é interno e não limita direitos legais.
      Silêncio não comprova realização. As avaliações administrativas não
      autorizam reembolso, pagamento ou crédito automaticamente.
    </Note>
  </Card>;
}
