import { ActionForm } from '@/components/action-form';
import { Card, Note, inputClass, textareaClass } from '@/components/ui';
import { reviewLessonIncident } from '@/app/actions/incidents';
import { reviewProtectionStatement } from '@/app/actions/protection-statements';
import { protectionStage3Enabled, PROTECTION_ASSESSMENTS, PROTECTION_DECLARATIONS } from '@/lib/protection-stage3';
import {
  ARCHIVE_MAX_PAGE, ARCHIVE_PAGE_SIZE, protectionArchiveRange, protectionArchiveUrl,
  type ProtectionArchiveParams,
} from '@/lib/protection-archive-pagination';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Area = 'aluno' | 'instrutor' | 'admin';
type LegacyIncident = {
  id: string; booking_id: string; meeting_id: string; reported_by: string;
  incident_type: string; minutes_done: number; status: string;
  description: string; resolution: string | null; created_at: string;
};
type Statement = {
  id: string; booking_id: string; meeting_id: string; author_id: string;
  version: number; declaration: string; claimed_minutes: number;
  narrative: string; created_at: string;
};
type Proof = { id: string; statement_id: string; original_name: string; object_path: string };

const date = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza',
}).format(new Date(value));
const incidentLabels: Record<string, string> = {
  weather: 'Condições do vento', absence: 'Ausência', equipment: 'Equipamento',
  safety: 'Segurança', other: 'Outro motivo',
};
const statusLabels: Record<string, string> = {
  open: 'Aberta', reviewing: 'Em análise', resolved: 'Resolvida', rejected: 'Não procedente',
};

function ArchivePager({
  area, params, section, page, total,
}: {
  area: Area; params: ProtectionArchiveParams;
  section: 'ocPagina' | 'manPagina'; page: number; total: number | null;
}) {
  const previous = page > 1;
  const next = total !== null && page * ARCHIVE_PAGE_SIZE < total && page < ARCHIVE_MAX_PAGE;
  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
  return <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-muted">
    <span>
      Página {page}{totalPages!==null?` de ${totalPages}`:''}
      {total!==null?` · ${total} registro(s) autorizado(s)`:''}
    </span>
    <nav aria-label={section==='ocPagina'?'Páginas das ocorrências':'Páginas das manifestações'}
      className="flex gap-3">
      {previous
        ? <a className="font-semibold text-brand underline"
          href={protectionArchiveUrl(area,params,section,page-1)}>Anterior</a>
        : <span aria-disabled="true">Anterior</span>}
      {next
        ? <a className="font-semibold text-brand underline"
          href={protectionArchiveUrl(area,params,section,page+1)}>Próxima</a>
        : <span aria-disabled="true">Próxima</span>}
    </nav>
  </div>;
}

/**
 * Independent, authenticated, paginated archive.
 *
 * A search filters bookings by an exact code using the caller's RLS. All
 * incident/statement and evidence reads also run as the current signed-in
 * user; no service-role keys, exposed author lookup, or unrestricted RPC.
 *
 * Both feeds are independently paged; neither depends on the monitor's 100
 * most recent entries. The structured feed stays off until migration 39.
 */
export async function ProtectionCaseArchive({
  area, viewerId, params,
}: {
  area: Area; viewerId: string; params: ProtectionArchiveParams;
}) {
  const enabled = protectionStage3Enabled();
  const db = await createSupabaseServerClient();
  const admin = area === 'admin';
  const codeSearch = params.codigo.length > 0;
  let bookingIds: string[] | null = null;
  let searchError = false;

  if (codeSearch) {
    const result = await db.from('bookings').select('id')
      .eq('code',params.codigo).limit(10).returns<{id: string}[]>();
    searchError=Boolean(result.error);
    bookingIds=(result.data??[]).map(b=>b.id);
  }

  const canQuery = !params.codigoInvalido && !searchError &&
    (bookingIds===null || bookingIds.length>0);
  const incidentsRange=protectionArchiveRange(params.ocorrenciasPagina);
  const statementsRange=protectionArchiveRange(params.manifestacoesPagina);

  async function getLegacy() {
    const query=db.from('booking_incidents')
      .select('id,booking_id,meeting_id,reported_by,incident_type,minutes_done,status,description,resolution,created_at',
        {count:'exact'});
    return (bookingIds===null?query:query.in('booking_id',bookingIds))
      .order('created_at',{ascending:false}).order('id',{ascending:false})
      .range(incidentsRange.from,incidentsRange.to).returns<LegacyIncident[]>();
  }
  async function getStatements() {
    const query=db.from('lesson_protection_statements')
      .select('id,booking_id,meeting_id,author_id,version,declaration,claimed_minutes,narrative,created_at',
        {count:'exact'});
    return (bookingIds===null?query:query.in('booking_id',bookingIds))
      .order('created_at',{ascending:false}).order('id',{ascending:false})
      .range(statementsRange.from,statementsRange.to).returns<Statement[]>();
  }

  const [incidentsResult, statementsResult] = await Promise.all([
    canQuery ? getLegacy() : Promise.resolve({data:[] as LegacyIncident[],count:0,error:null}),
    canQuery&&enabled ? getStatements()
      : Promise.resolve({data:[] as Statement[],count:0,error:null}),
  ]);
  const legacy = incidentsResult.data??[];
  const statements = statementsResult.data??[];
  const error=Boolean(incidentsResult.error||statementsResult.error||searchError);

  const codes=new Map<string,string>();
  // Never look up arbitrary bookings from client input. Query only ids
  // returned by the signed-in user's RLS-protected archive rows.
  const ids=[...new Set([...legacy.map(r=>r.booking_id),...statements.map(r=>r.booking_id)])];
  if(ids.length){
    const {data}=await db.from('bookings').select('id,code')
      .in('id',ids).returns<{id:string;code:string}[]>();
    for(const item of data??[])codes.set(item.id,item.code);
  }

  const proofs = new Map<string, {name:string;url:string}[]>();
  if(enabled&&statements.length){
    const {data}=await db.from('lesson_protection_evidence')
      .select('id,statement_id,original_name,object_path')
      .in('statement_id',statements.map(s=>s.id)).eq('confirmed',true)
      .order('created_at',{ascending:false}).limit(100).returns<Proof[]>();
    // Each signed URL is authorized separately by the Storage RLS policy.
    for(const file of (data??[]).slice(0,40)){
      const signed=await db.storage.from('vento-protection-evidence')
        .createSignedUrl(file.object_path,300);
      if(!signed.data?.signedUrl)continue;
      const entries=proofs.get(file.statement_id)??[];
      entries.push({name:file.original_name,url:signed.data.signedUrl});
      proofs.set(file.statement_id,entries);
    }
  }

  return <Card className="mb-5">
    <div id="arquivo-protege" className="scroll-mt-24">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
        VentoKite Protege · Histórico consultável
      </p>
      <h2 className="mt-1 text-[18px] font-bold text-ink">Buscar ocorrências por reserva</h2>
      <p className="mt-2 text-[12px] text-muted">
        Consulte registros antigos, inclusive de aulas concluídas. Os resultados
        respeitam as permissões do seu perfil e não alteram o estado da reserva.
      </p>
      <form action={`/${area}/ocorrencias`} method="get"
        className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="codigo-reserva-protege" className="mb-1 block text-[12px] font-semibold">
            Código da reserva
          </label>
          <input id="codigo-reserva-protege" name="codigo" type="search"
            defaultValue={params.codigo}
            maxLength={40} placeholder="Ex.: VNT-TEST-1003"
            className={inputClass}/>
        </div>
        <button type="submit"
          className="min-h-10 rounded-xl bg-brand px-4 text-[12px] font-bold text-white">
          Buscar
        </button>
        {codeSearch ? <a href={`/${area}/ocorrencias#arquivo-protege`}
          className="min-h-10 content-center text-[12px] font-semibold text-brand underline">
          Limpar busca
        </a>:null}
      </form>
      {params.codigoInvalido?<Note tone="warning" className="mt-3">
        Informe um código com 3 a 40 caracteres: letras, números, hífen ou sublinhado.
      </Note>:null}
      {error?<Note tone="warning" className="mt-3">
        Não foi possível completar esta consulta. Tente novamente; a ausência de resultado
        não significa que uma manifestação não exista.
      </Note>:null}
      {codeSearch&&!params.codigoInvalido&&!error&&bookingIds?.length===0?
        <Note className="mt-3">
          Nenhuma reserva acessível corresponde ao código informado. Isso não
          revela se existem registros de terceiros.
        </Note>:null}
    </div>

    <section className="mt-5">
      <h3 className="text-[15px] font-bold text-ink">Ocorrências registradas</h3>
      {legacy.length===0&&!error?<p className="mt-2 text-[12px] text-muted">
        Nenhum registro autorizado encontrado nesta página.
      </p>:null}
      <div className="mt-2 divide-y divide-line">
        {legacy.map(x=><article key={x.id} className="py-3">
          <div className="flex flex-wrap justify-between gap-2">
            <strong className="text-[12px] text-ink">{incidentLabels[x.incident_type]??'Ocorrência'}</strong>
            <span className="text-[12px] text-brand">{statusLabels[x.status]??x.status}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Reserva {codes.get(x.booking_id)??'restrita'} · {date(x.created_at)}
            {x.reported_by===viewerId?' · Relato enviado por você':''}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-[12px] text-ink">{x.description}</p>
          <p className="mt-1 text-[11px] text-muted">{x.minutes_done} minutos informados</p>
          {x.resolution?<p className="mt-2 text-[12px] text-ink">
            Análise anterior: {x.resolution}
          </p>:null}
          {admin?<details className="mt-3">
            <summary className="cursor-pointer text-[12px] font-semibold text-brand">
              Analisar ocorrência
            </summary>
            <ActionForm action={reviewLessonIncident} submitLabel="Registrar análise"
              className="mt-3 grid gap-3">
              <input type="hidden" name="id" value={x.id}/>
              <select name="status" defaultValue="reviewing" className={inputClass}>
                <option value="reviewing">Em análise</option>
                <option value="resolved">Resolvida</option>
                <option value="rejected">Não procedente</option>
              </select>
              <textarea name="resolution" minLength={5} maxLength={1000}
                required rows={3} className={textareaClass}/>
            </ActionForm>
          </details>:null}
        </article>)}
      </div>
      {canQuery&&!incidentsResult.error?<ArchivePager area={area} params={params}
        section="ocPagina" page={params.ocorrenciasPagina} total={incidentsResult.count}/>:null}
    </section>

    {enabled?<section className="mt-6 border-t border-line pt-4">
      <h3 className="text-[15px] font-bold text-ink">Manifestações versionadas</h3>
      <p className="mt-1 text-[12px] text-muted">
        Histórico independente de aluno e instrutor. Uma manifestação não
        confirma presença nem autoriza pagamento ou estorno.
      </p>
      {statements.length===0&&!error?<p className="mt-2 text-[12px] text-muted">
        Nenhuma manifestação acessível encontrada nesta página.
      </p>:null}
      <div className="mt-2 divide-y divide-line">
        {statements.map(x=><article key={x.id} className="py-3">
          <strong className="text-[12px] text-ink">
            {PROTECTION_DECLARATIONS[x.declaration as keyof typeof PROTECTION_DECLARATIONS]??'Manifestação'}
          </strong>
          <p className="mt-1 text-[11px] text-muted">
            Reserva {codes.get(x.booking_id)??'restrita'} · Versão {x.version}
            {' · '}{date(x.created_at)}
            {x.author_id===viewerId?' · Relato enviado por você':''}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-[12px] text-ink">{x.narrative}</p>
          <p className="mt-1 text-[11px] text-muted">{x.claimed_minutes} minutos declarados</p>
          {(proofs.get(x.id)??[]).map((proof,index)=><p key={index} className="mt-1 text-[12px]">
            <a className="text-brand underline" target="_blank" rel="noopener noreferrer"
              href={proof.url}>Prova privada: {proof.name}</a>
          </p>)}
          {admin?<details className="mt-3">
            <summary className="cursor-pointer text-[12px] font-semibold text-brand">
              Registrar avaliação administrativa
            </summary>
            <ActionForm action={reviewProtectionStatement}
              submitLabel="Registrar avaliação" className="mt-3 grid gap-3">
              <input type="hidden" name="meeting" value={x.meeting_id}/>
              <select name="assessment" className={inputClass}>
                {Object.entries(PROTECTION_ASSESSMENTS).map(([key,label])=>
                  <option key={key} value={key}>{label}</option>)}
              </select>
              <textarea name="rationale" required minLength={20} maxLength={2000}
                rows={3} className={textareaClass}/>
            </ActionForm>
          </details>:null}
        </article>)}
      </div>
      {canQuery&&!statementsResult.error?<ArchivePager area={area} params={params}
        section="manPagina" page={params.manifestacoesPagina} total={statementsResult.count}/>:null}
      <p className="mt-3 text-[11px] text-muted">
        A consulta de arquivos de prova é restrita ao autor e à administração.
        Para visualizar anexos fora desta página, consulte o suporte.
      </p>
    </section>:null}
    <Note className="mt-5">
      Mostramos até 20 registros por página, em ordem estável.
      A busca pelo código exige acesso à reserva; instrutores substituídos
      podem ter acesso ao próprio relato na listagem geral, sem acesso aos
      dados atuais da reserva. Não encontrar um registro não comprova silêncio.
    </Note>
  </Card>;
}
