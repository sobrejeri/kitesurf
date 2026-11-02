import { ActionForm } from '@/components/action-form';
import { Icon } from '@/components/icon';
import { MeetingChangeDatePicker } from '@/components/meeting-change-date-picker';
import { requestMeetingChange, respondMeetingChange, resolveStudentChange } from '@/app/actions/meeting-change';
import { Badge, Note, Field, textareaClass } from '@/components/ui';
import type { Meeting } from '@/lib/data';
import type { MeetingChangeRead } from '@/lib/meeting-changes';
import { formatDateLong, formatTime } from '@/lib/format';

function localDateTime(value:Date) {
  return new Intl.DateTimeFormat('sv-SE',{
    timeZone:'America/Fortaleza',
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).format(value).replace(' ','T');
}

function ScheduleRow({ label, value }:{label:string;value:string}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-brand-tint px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-ink">{value}</p>
    </div>
  );
}

function dateAndTime(iso:string) {
  return formatDateLong(iso)+' · '+formatTime(iso);
}

/**
 * Shared, role-aware reschedule UI. Only the relevant action is expanded:
 * receiving a request, waiting for a response, choosing a replacement, or
 * asking for a new date. All authorization and deadlines remain in the RPCs.
 */
export function MeetingChangePanel({
  bookingId,meeting,viewerId,viewerRole,changes,bookingStatus,
}:{
  bookingId:string;meeting:Meeting;viewerId:string;
  viewerRole:'student'|'instructor';
  changes:MeetingChangeRead;bookingStatus:string;
}){
  if(bookingStatus!=='confirmed' || meeting.status!=='scheduled') return null;
  if(!changes.ready) {
    return <Note tone="warning" className="mt-3">
      Alteração de datas indisponível. Confira se as Migrations 30 e 31 foram aplicadas.
    </Note>;
  }

  const now=Date.now();
  const pending=changes.rows.find(r=>r.booking_id===bookingId && r.status==='pending');
  const current=pending?.meeting_id===meeting.id ? pending:null;
  const received=current?.responder_id===viewerId;
  const sent=current?.requester_id===viewerId;
  const withinReplyTime=current ? Date.parse(current.expires_at)>now : false;

  const decision=viewerRole==='student' ? changes.rows.find(r=>
    r.meeting_id===meeting.id && r.requester_id===viewerId
    && (r.status==='expired'||r.status==='rejected')
    && r.choice_expires_at && !r.resolution
    && Date.parse(r.choice_expires_at)>now
  ) : null;
  const firstAvailable=Math.max(
    Date.parse(meeting.starts_at)+60_000,
    Math.ceil((now+72*3600000)/60_000)*60_000,
  );
  const lastAvailable=Math.floor((now+90*86400000)/60_000)*60_000;
  const eligible=Date.parse(meeting.starts_at)>=now+72*3600000
    && firstAvailable<=lastAvailable;
  const proposed=localDateTime(new Date(Math.min(lastAvailable,Math.max(
    Date.parse(meeting.starts_at)+7*86400000,now+4*86400000,
    firstAvailable,
  ))));
  const history=changes.rows.filter(r=>r.meeting_id===meeting.id && r.status!=='pending');

  if(decision) {
    return (
      <section className="mt-3 rounded-[16px] border border-line bg-surface p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-ink">Decidir sobre sua reserva</h3>
          <Badge tone="warning">Até 12h</Badge>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          A alteração não foi aprovada. Escolha até {dateAndTime(decision.choice_expires_at ?? decision.expires_at)}.
          A data original permanece reservada enquanto você decide.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 [&_button]:w-full [&_button]:!px-2">
          <ActionForm action={resolveStudentChange} submitLabel="Buscar instrutor" wideSubmit>
            <input type="hidden" name="requestId" value={decision.id}/>
            <input type="hidden" name="bookingId" value={bookingId}/>
            <input type="hidden" name="choice" value="replace"/>
          </ActionForm>
          <ActionForm action={resolveStudentChange} submitVariant="danger"
            submitLabel="Cancelar reserva" wideSubmit>
            <input type="hidden" name="requestId" value={decision.id}/>
            <input type="hidden" name="bookingId" value={bookingId}/>
            <input type="hidden" name="choice" value="cancel"/>
          </ActionForm>
        </div>
      </section>
    );
  }

  if(current) {
    return (
      <section className="mt-3 rounded-[16px] border border-line bg-surface p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-ink">
            {received?'Solicitação de alteração':'Alteração solicitada'}
          </h3>
          <Badge tone="warning">{received&&withinReplyTime?'Responder em até 12h':
            withinReplyTime?'Aguardando resposta':'Prazo encerrado'}</Badge>
        </div>
        <div className="mt-3 grid gap-2">
          <ScheduleRow label="Data atual" value={dateAndTime(current.original_starts_at)}/>
          <ScheduleRow label="Nova data solicitada" value={dateAndTime(current.proposed_starts_at)}/>
          <div className="rounded-xl border border-line bg-brand-tint px-3 py-2.5">
            <p className="text-[11px] text-muted">Motivo informado</p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{current.reason}</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          {received&&withinReplyTime
            ? 'Responda até '+dateAndTime(current.expires_at)+'.'
            : sent&&withinReplyTime
              ? 'Aguardando resposta até '+dateAndTime(current.expires_at)+'.'
              : 'O prazo de resposta terminou. A atualização depende do processamento do sistema.'}
        </p>
        {received&&withinReplyTime ? (
          <div className="mt-3 grid grid-cols-2 gap-2 [&_button]:w-full [&_button]:!px-2">
            <ActionForm action={respondMeetingChange} submitLabel="Aprovar" wideSubmit>
              <input type="hidden" name="requestId" value={current.id}/>
              <input type="hidden" name="bookingId" value={bookingId}/>
              <input type="hidden" name="decision" value="accept"/>
            </ActionForm>
            <ActionForm action={respondMeetingChange} submitVariant="ghost"
              submitLabel="Recusar" wideSubmit>
              <input type="hidden" name="requestId" value={current.id}/>
              <input type="hidden" name="bookingId" value={bookingId}/>
              <input type="hidden" name="decision" value="reject"/>
            </ActionForm>
          </div>
        ) : null}
        <p className="mt-3 text-[11px] text-muted">
          A data só muda após a aprovação. As horas contratadas permanecem iguais.
        </p>
      </section>
    );
  }

  return (
    <div className="mt-3">
      {pending ? (
        <p className="rounded-xl border border-line bg-brand-tint px-3 py-2.5 text-[12px] text-muted">
          Outra alteração desta reserva está aguardando resposta.
        </p>
      ) : eligible ? (
        <details className="group min-w-0 w-full">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl bg-brand-tint px-3.5 py-3 text-[14px] font-semibold hover:bg-brand-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
            <span className={viewerRole==='student'?'text-[#65e0e9]':'text-brand'}>
              Alterar data ou horário
            </span>
            <Icon name="chevronDown"
              className={`!h-4 !w-4 text-muted transition-transform group-open:rotate-180`}/>
          </summary>
          <div className="min-w-0 px-0.5 pt-3">
            <p className="mb-3 text-[12px] leading-relaxed text-muted">
              {viewerRole==='instructor'
                ? 'Proponha uma data posterior. O aluno terá 12 horas para responder.'
                : 'Escolha uma data posterior. O instrutor terá 12 horas para responder.'}
            </p>
            <ActionForm action={requestMeetingChange}
              submitLabel="Enviar solicitação"
              wideSubmit
              submitClassName={viewerRole==='student'
                ? 'meeting-change-student-submit !min-h-12 !text-[15px] !font-semibold'
                : '!min-h-12 !text-[15px] !font-semibold'}
              className="grid min-w-0 gap-3">
              <input type="hidden" name="meetingId" value={meeting.id}/>
              <input type="hidden" name="bookingId" value={bookingId}/>
              <MeetingChangeDatePicker
                initial={proposed}
                min={localDateTime(new Date(firstAvailable))}
                max={localDateTime(new Date(lastAvailable))}
                role={viewerRole}
              />
              <Field label="Motivo">
                <textarea name="reason" required minLength={8} maxLength={500}
                  rows={2} className={textareaClass+' min-w-0 min-h-[88px] resize-y'}
                  placeholder="Explique brevemente o motivo da alteração."/>
              </Field>
              <p className="text-[11px] leading-relaxed text-muted">
                Solicite com pelo menos 72 horas de antecedência. Não é permitido antecipar a aula.
              </p>
            </ActionForm>
          </div>
        </details>
      ) : (
        <p className="rounded-xl border border-line bg-surface px-3 py-2.5 text-[12px] text-muted">
          {viewerRole==='instructor'
            ? 'Prazo de alteração encerrado. Consulte a administração em caso de imprevisto.'
            : 'O prazo para solicitar alteração já terminou.'}
        </p>
      )}
      {history.length ? (
        <details className="mt-2 px-1 text-[11px] text-muted">
          <summary className="cursor-pointer">Histórico de alterações</summary>
          <ul className="mt-2 space-y-1">
            {history.slice(0,5).map(r=>(
              <li key={r.id}>
                {r.status==='accepted'?'Aprovada':r.status==='rejected'?'Recusada':'Expirada'}
                {' · '}{formatDateLong(r.requested_at)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
