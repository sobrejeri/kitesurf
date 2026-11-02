import { ActionForm } from '@/components/action-form';
import { requestMeetingChange, respondMeetingChange, resolveStudentChange } from '@/app/actions/meeting-change';
import { Badge, Note, Field, inputClass, textareaClass } from '@/components/ui';
import type { Meeting } from '@/lib/data';
import type { MeetingChangeRead } from '@/lib/meeting-changes';
import { formatDateLong,formatTime } from '@/lib/format';

function localDateTime(value:Date) {
  const parts = new Intl.DateTimeFormat('sv-SE',{
    timeZone:'America/Fortaleza',
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).format(value);
  return parts.replace(' ','T');
}

export function MeetingChangePanel({
  bookingId,meeting, viewerId, changes, bookingStatus,
}:{
  bookingId:string;meeting:Meeting;viewerId:string;
  changes:MeetingChangeRead;bookingStatus:string;
}){
  if(bookingStatus!=='confirmed' || meeting.status==='done' || meeting.status==='cancelled') return null;
  if(!changes.ready){
    return <Note tone="warning" className="mt-3">
      Alterações de horário exigem a Migration 30 no Supabase.
    </Note>;
  }
  const now=Date.now();

  const pending=changes.rows.find(r=>r.booking_id===bookingId && r.status==='pending');
  const studentDecision=changes.rows.find(r=>r.meeting_id===meeting.id
    && r.requester_id===viewerId && (r.status==='expired'||r.status==='rejected')
    && r.choice_expires_at && !r.resolution && Date.parse(r.choice_expires_at)>now);

  const here=pending?.meeting_id===meeting.id ? pending:null;
  const eligible=meeting.status==='scheduled'
    && Date.parse(meeting.starts_at)>=now+72*3600000;
  const proposed=localDateTime(new Date(Math.max(
    Date.parse(meeting.starts_at)+7*86400000,
    now+4*86400000,
  )));
  return (
    <section className="mt-4 rounded-[16px] border border-line bg-surface p-3">
      <h3 className="text-[15px] font-bold text-ink">Alterar data ou horário</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Solicite até 72 horas antes da aula. A nova data deve ser posterior
        à atual, nunca antecipada. A outra pessoa terá 12 horas para responder.
        Se o instrutor não responder, o aluno terá mais 12 horas para escolher
        cancelar ou buscar substituto. Sem escolha, iniciaremos a busca na fila.
        Cancelamento e valores pagos exigem análise de reembolso.
      </p>
      {studentDecision ? (
        <div className="mt-3 grid gap-3 rounded-xl border border-amber-600/50 p-3">
          <Badge tone="warning">Sua escolha · 12 horas</Badge>
          <p className="text-[12px] text-muted">
            A alteração não foi aprovada. Escolha até
            {' '}{formatDateLong(studentDecision.choice_expires_at!)} às
            {' '}{formatTime(studentDecision.choice_expires_at!)}.
            O horário original continua reservado enquanto você decide.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionForm action={resolveStudentChange}
              submitLabel="Buscar outro instrutor">
              <input type="hidden" name="requestId" value={studentDecision.id}/>
              <input type="hidden" name="bookingId" value={bookingId}/>
              <input type="hidden" name="choice" value="replace"/>
            </ActionForm>
            <ActionForm action={resolveStudentChange} submitVariant="ghost"
              submitLabel="Cancelar reserva">
              <input type="hidden" name="requestId" value={studentDecision.id}/>
              <input type="hidden" name="bookingId" value={bookingId}/>
              <input type="hidden" name="choice" value="cancel"/>
            </ActionForm>
          </div>
        </div>
      ) : here ? (
        <div className="mt-3 grid gap-2 rounded-xl border border-line p-3">
          <Badge tone="warning">Aguardando resposta</Badge>
          <p className="text-[13px] text-ink">
            Proposta: <strong>{formatDateLong(here.proposed_starts_at)} às {formatTime(here.proposed_starts_at)}</strong>
          </p>
          <p className="text-[12px] text-muted">Motivo: {here.reason}</p>
          <p className="text-[12px] text-muted">
            Prazo para resposta: {formatDateLong(here.expires_at)} às {formatTime(here.expires_at)}
          </p>
          {here.responder_id===viewerId && Date.parse(here.expires_at)>now ? (
            <ActionForm action={respondMeetingChange}
              submitLabel="Enviar minha decisão" className="grid gap-3">
              <input type="hidden" name="requestId" value={here.id}/>
              <input type="hidden" name="bookingId" value={bookingId}/>
              <Field label="Responder à proposta">
                <select name="decision" required className={inputClass} defaultValue="">
                  <option value="" disabled>Escolha uma resposta</option>
                  <option value="accept">Aceitar nova data</option>
                  <option value="reject">Recusar e manter data original</option>
                </select>
              </Field>
            </ActionForm>
          ) : (
            <p className="text-[12px] text-muted">
              {here.responder_id===viewerId
                ? 'O prazo terminou. O aluno terá a escolha de manter a venda ou cancelar.'
                : 'Aguardando decisão da outra pessoa.'}
            </p>
          )}
        </div>
      ) : pending ? (
        <p className="mt-3 text-[12px] text-muted">
          Existe outra solicitação pendente nesta reserva. Aguarde a resposta antes de pedir nova mudança.
        </p>
      ) : eligible ? (
        <ActionForm action={requestMeetingChange}
          submitLabel="Solicitar alteração" className="mt-4 grid gap-3">
          <input type="hidden" name="meetingId" value={meeting.id}/>
          <input type="hidden" name="bookingId" value={bookingId}/>
          <Field label="Nova data e horário (Ceará · apenas posterior)">
            <input type="datetime-local" name="proposedDate" required
              min={localDateTime(new Date(Math.max(now+72*3600000,
                Date.parse(meeting.starts_at)+60_000)))}
              defaultValue={proposed} className={inputClass+' [color-scheme:dark]'}/>
          </Field>
          <Field label="Motivo da solicitação">
            <textarea name="reason" required minLength={8} maxLength={500}
              rows={3} className={textareaClass}
              placeholder="Explique por que deseja mudar o dia ou horário."/>
          </Field>
        </ActionForm>
      ) : (
        <p className="mt-3 text-[12px] text-warning">
          O prazo de 72 horas antes do encontro terminou ou esta aula já foi iniciada.
          Em caso de imprevisto, entre em contato pelo chat e consulte as regras de cancelamento.
        </p>
      )}
      {changes.rows.filter(r=>r.meeting_id===meeting.id && r.status!=='pending').slice(0,2).map(r=>(
        <p key={r.id} className="mt-2 text-[11px] text-muted">
          {r.status==='accepted'?'Alteração aprovada':r.status==='rejected'?'Alteração recusada':
            'Solicitação expirada'} · {formatDateLong(r.requested_at)}
        </p>
      ))}
    </section>
  );
}
