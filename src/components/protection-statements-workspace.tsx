import { ActionForm } from '@/components/action-form';
import { Card, Note, inputClass } from '@/components/ui';
import { EvidenceUpload } from '@/components/protection-evidence-upload';
import {
  submitProtectionStatement, reviewProtectionStatement,
} from '@/app/actions/protection-statements';
import {
  PROTECTION_DECLARATIONS, PROTECTION_ASSESSMENTS, protectionStage3Enabled,
} from '@/lib/protection-stage3';
import type { ProtectionMonitorItem } from '@/lib/protection-monitor';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type ProtectionStatement = {
  id:string; meeting_id:string; author_id:string; version:number; declaration:string;
  claimed_minutes:number; narrative:string; created_at:string;
};
type ProtectionReview = {
  id:string; meeting_id:string; admin_id:string; assessment:string;
  rationale:string; created_at:string;
};
type ProtectionEvidence = {
  id:string; statement_id:string; uploader_id:string; object_path:string;
  original_name:string; mime_type:string; bytes:number; confirmed:boolean;
};
const dateLabel=(iso:string)=>new Intl.DateTimeFormat('pt-BR',{
  dateStyle:'short',timeStyle:'short',timeZone:'America/Fortaleza',
}).format(new Date(iso));

export async function ProtectionStatementsWorkspace({
  area,viewerId,items,roles,
}:{
  area:'aluno'|'instrutor'|'admin';
  viewerId:string;
  items:readonly ProtectionMonitorItem[];
  roles:Readonly<Record<string,{studentId:string;instructorId:string|null}>>;
}) {
  if(!protectionStage3Enabled() || !items.length)return null;
  const admin=area==='admin';
  const visible=items.slice(0,12), ids=visible.map(x=>x.id);
  const db=await createSupabaseServerClient();
  const [statementsResult,reviewsResult,evidenceResult]=await Promise.all([
    db.from('lesson_protection_statements')
      .select('id,meeting_id,author_id,version,declaration,claimed_minutes,narrative,created_at')
      .in('meeting_id',ids).order('created_at',{ascending:false})
      .limit(200).returns<ProtectionStatement[]>(),
    db.from('lesson_protection_reviews')
      .select('id,meeting_id,admin_id,assessment,rationale,created_at')
      .in('meeting_id',ids).order('created_at',{ascending:false})
      .limit(100).returns<ProtectionReview[]>(),
    db.from('lesson_protection_evidence')
      .select('id,statement_id,uploader_id,object_path,original_name,mime_type,bytes,confirmed')
      .eq('confirmed',true).order('created_at',{ascending:false})
      .limit(100).returns<ProtectionEvidence[]>(),
  ]);
  const statements=statementsResult.data??[];
  const reviews=reviewsResult.data??[];
  const evidence=evidenceResult.data??[];
  const readError=Boolean(statementsResult.error||reviewsResult.error||evidenceResult.error);
  const proofUrls=new Map<string,string>();
  if(!readError){
    const visibleStatementIds=new Set(statements.map(s=>s.id));
    // The database RLS limits evidence to its uploader and Admin. Signed URLs
    // are short-lived, so cannot be used to expose another participant's files.
    for(const item of evidence.filter(e=>visibleStatementIds.has(e.statement_id)).slice(0,24)){
      const {data}=await db.storage.from('vento-protection-evidence')
        .createSignedUrl(item.object_path,300);
      if(data?.signedUrl)proofUrls.set(item.id,data.signedUrl);
    }
  }
  const partyLabel=(meetingId:string,authorId:string)=>{
    const party=roles[meetingId];
    if(authorId===party?.studentId)return 'Aluno';
    if(authorId===party?.instructorId)return 'Instrutor';
    return authorId===viewerId?'Você':'Participante';
  };
  return <Card className="mb-5">
    <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">Etapa 3B · VentoKite Protege</p>
    <h2 className="mt-1 text-[18px] font-bold text-ink">Manifestação de cada participante</h2>
    <p className="mt-2 text-[12px] leading-relaxed text-muted">
      Registros independentes e versionados. Você pode complementar uma manifestação;
      os registros anteriores são preservados. Eles não confirmam presença nem liberam valores.
    </p>
    {readError?<Note tone="warning" className="mt-3">
      Não foi possível ler as manifestações ou provas com segurança. Nenhuma conclusão deve
      ser tirada da ausência de registros nesta tela.
    </Note>:null}
    <div className="mt-4 grid gap-3">
      {visible.map(meeting=>{
        const rows=statements.filter(s=>s.meeting_id===meeting.id);
        const decisions=reviews.filter(r=>r.meeting_id===meeting.id);
        const own=rows.find(s=>s.author_id===viewerId);
        return <details key={meeting.id} className="rounded-xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink">
            {meeting.bookingCode} · {dateLabel(meeting.startsAt)} · {meeting.minutes} minutos
            <span className="ml-2 text-[11px] font-normal text-muted">
              {rows.length} manifestação(ões) na consulta
            </span>
          </summary>
          <div className="mt-4 grid gap-4">
            {!rows.length?<Note>
              Nenhuma manifestação encontrada na consulta. Isso não prova ausência de resposta.
            </Note>:rows.map(s=><div key={s.id} className="rounded-xl border border-line bg-brand-wash px-3 py-3">
              <p className="text-[12px] font-semibold text-ink">
                {partyLabel(meeting.id,s.author_id)} · versão {s.version}
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
                    : <span className="text-muted">Arquivo reservado à parte que enviou e ao Admin</span>}
                </p>
              ))}
            </div>)}
            {!admin&&!readError?<div className="rounded-xl border border-line px-4 py-4">
              <h3 className="text-[13px] font-bold text-ink">
                {own?'Adicionar nova versão do seu relato':'Enviar sua manifestação'}
              </h3>
              <ActionForm action={submitProtectionStatement} submitLabel="Registrar minha versão"
                className="mt-3 grid gap-3">
                <input type="hidden" name="meeting" value={meeting.id}/>
                <input type="hidden" name="scheduledMinutes" value={meeting.minutes}/>
                <label htmlFor={'declaration-'+meeting.id} className="text-[12px] font-semibold">
                  Como foi o encontro?
                </label>
                <select id={'declaration-'+meeting.id} name="declaration" className={inputClass} required>
                  {Object.entries(PROTECTION_DECLARATIONS).map(([key,label])=>
                    <option value={key} key={key}>{label}</option>)}
                </select>
                <label htmlFor={'minutes-'+meeting.id} className="text-[12px] font-semibold">
                  Minutos que você afirma terem sido realizados
                </label>
                <input id={'minutes-'+meeting.id} type="number" name="claimedMinutes"
                  min={0} max={meeting.minutes} defaultValue={meeting.minutes} required className={inputClass}/>
                <p className="text-[11px] text-muted">
                  Informe 0 para aula não realizada, ausência ou risco;
                  o total para realização integral e um valor intermediário para aula parcial.
                </p>
                <label htmlFor={'narrative-'+meeting.id} className="text-[12px] font-semibold">
                  Sua justificativa
                </label>
                <textarea id={'narrative-'+meeting.id} name="narrative" rows={4}
                  minLength={20} maxLength={2000} required className={inputClass}
                  placeholder="Descreva o que aconteceu, horários, tentativas de contato e eventuais provas."/>
              </ActionForm>
              {own?<EvidenceUpload area={area} statementId={own.id}/>:(
                <p className="mt-3 text-[11px] text-muted">
                  Após registrar sua primeira manifestação, você poderá anexar até seis provas privadas.
                </p>
              )}
            </div>:null}
            {decisions.map(d=><div key={d.id} className="rounded-xl border border-line px-3 py-3">
              <p className="text-[12px] font-semibold text-ink">
                Registro da administração · {dateLabel(d.created_at)}
              </p>
              <p className="mt-1 text-[12px] text-brand">
                {PROTECTION_ASSESSMENTS[d.assessment as keyof typeof PROTECTION_ASSESSMENTS] ??'Avaliação'}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-[12px] text-ink">{d.rationale}</p>
            </div>)}
            {admin&&rows.length>0&&!readError?<ActionForm action={reviewProtectionStatement}
              submitLabel="Registrar avaliação administrativa" className="grid gap-3">
              <input type="hidden" name="meeting" value={meeting.id}/>
              <label className="text-[12px] font-semibold" htmlFor={'assessment-'+meeting.id}>
                Encaminhamento
              </label>
              <select name="assessment" id={'assessment-'+meeting.id} className={inputClass}>
                {Object.entries(PROTECTION_ASSESSMENTS).map(([key,label])=>
                  <option key={key} value={key}>{label}</option>)}
              </select>
              <label className="text-[12px] font-semibold" htmlFor={'rationale-'+meeting.id}>
                Fundamentação (não movimenta dinheiro)
              </label>
              <textarea name="rationale" id={'rationale-'+meeting.id} rows={4}
                minLength={20} maxLength={2000} required className={inputClass}/>
            </ActionForm>:null}
          </div>
        </details>;
      })}
    </div>
    <Note className="mt-4">
      Os prazos de cinco dias são internos e não limitam direitos legais.
      A ausência de resposta não é comprovação de aula. Avaliações administrativas
      são recomendações: reembolsos, saldo de horas e repasses continuam em outro fluxo.
    </Note>
  </Card>;
}
