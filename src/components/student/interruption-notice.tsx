import { Badge, ButtonLink, Note } from '@/components/ui';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import { interruptionCopy } from '@/lib/meeting-interruption';

/**
 * #93 etapa 3: o que o ALUNO vê quando uma aula foi interrompida. Sem pedido de reposição e sem "renunciar saldo":
 * a continuidade é combinada com o instrutor pelo chat e agendada só por ele (mesmo encontro, sem nova cobrança).
 */
export function InterruptionNotice({ state, plannedMinutes, previousDone, remaining, startsAt, chatHref }: {
  state: 'awaiting_resume' | 'resume_scheduled' | 'resumed';
  plannedMinutes: number | null | undefined;
  previousDone: number | undefined;
  remaining: number | null | undefined;
  startsAt: string;
  chatHref: string;
}) {
  const copy = interruptionCopy(state, { plannedMinutes, previousDone, remaining });
  if (!copy) return null;
  return (
    <div className="mt-3 grid gap-2" data-testid="interruption-notice">
      <Note tone={state === 'awaiting_resume' ? 'warning' : 'brand'} icon="info">
        <strong className="block">{copy.title}</strong>
        {copy.body}
        {state === 'resume_scheduled' ? <span className="mt-1 block font-semibold">Nova data: {formatDateLong(startsAt)} às {formatTime(startsAt)}{remaining ? ` · ${formatMinutes(remaining)}` : ''}</span> : null}
      </Note>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={state === 'awaiting_resume' ? 'warning' : state === 'resume_scheduled' ? 'brand' : 'quiet'}>{copy.badge}</Badge>
        {state !== 'resumed' ? <ButtonLink href={chatHref} icon="chat" variant="ghost">Falar com meu instrutor</ButtonLink> : null}
      </div>
    </div>
  );
}
