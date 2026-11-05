import { ActionForm } from '@/components/action-form';
import { MeetingChangeDatePicker } from '@/components/meeting-change-date-picker';
import { requestBalanceMeeting, closeBookingBalance } from '@/app/actions/balance';
import { Badge, Card, Note, inputClass } from '@/components/ui';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import type { BalanceRequestRead } from '@/lib/balance-requests';

const STATUS_LABEL: Record<'accepted' | 'rejected' | 'expired', string> = {
  accepted: 'Confirmada',
  rejected: 'Recusada pelo instrutor',
  expired: 'Expirada sem resposta',
};

/**
 * Student-facing panel for the paid-but-unrecorded hours balance. The student
 * proposes a make-up lesson for the same instructor; the backend keeps the
 * money snapshot frozen, so there is never a new charge.
 */
export function BalanceMeetingPanel({
  bookingId, balanceMinutes, requests, minStart, maxStart,
}: {
  bookingId: string;
  balanceMinutes: number;
  requests: BalanceRequestRead;
  minStart: string;
  maxStart: string;
}) {
  if (balanceMinutes <= 0) return null;

  if (!requests.ready) {
    return (
      <Card>
        <h2 className="text-[16px]">Saldo de horas</h2>
        <Note tone="warning" className="mt-3">
          O reagendamento de saldo depende da migração 38. Avise a administração para atualizar o Supabase.
        </Note>
      </Card>
    );
  }

  const pending = requests.rows.find((r) => r.status === 'pending');
  const history = requests.rows.filter((r) => r.status !== 'pending').slice(0, 3);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px]">Saldo de horas</h2>
        <span className="tabular font-[550] text-brand">{formatMinutes(balanceMinutes)}</span>
      </div>
      <p className="mt-1 text-[12px] text-muted">
        Horas já pagas que o instrutor ainda não registrou. Agende uma aula de reposição
        com o mesmo instrutor, sem nova cobrança.
      </p>

      {pending ? (
        <Note icon="clock" className="mt-4">
          Reposição de {formatMinutes(pending.minutes)} pedida para{' '}
          {formatDateLong(pending.proposed_starts_at)} · {formatTime(pending.proposed_starts_at)}.
          Aguardando a confirmação do instrutor (até 48h).
        </Note>
      ) : (
        <>
          <ActionForm action={requestBalanceMeeting} submitLabel="Pedir aula de reposição" className="mt-4 grid gap-3" wideSubmit>
            <input type="hidden" name="bookingId" value={bookingId} />
            <MeetingChangeDatePicker initial={minStart} min={minStart} max={maxStart} role="student" />
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[12px] font-medium text-label">Minutos a reagendar (até {balanceMinutes})</span>
              <input
                type="number" name="minutes" min={1} max={balanceMinutes} step={5}
                defaultValue={balanceMinutes} required
                className={inputClass + ' block min-w-0 max-w-full'}
              />
            </label>
            <p className="text-[11px] leading-relaxed text-muted">
              A aula precisa começar daqui a pelo menos 72 horas. O instrutor confirma antes de entrar na agenda.
            </p>
          </ActionForm>

          <ActionForm action={closeBookingBalance} submitLabel="Não quero usar este saldo — encerrar"
            submitVariant="ghost" className="mt-4 border-t border-line pt-4"
            submitClassName="!text-[12px]">
            <input type="hidden" name="bookingId" value={bookingId} />
          </ActionForm>
        </>
      )}

      {history.length ? (
        <ul className="mt-4 grid gap-1.5 border-t border-line pt-3 text-[11px] text-muted">
          {history.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span>{formatDateLong(r.proposed_starts_at)} · {formatMinutes(r.minutes)}</span>
              <Badge tone={r.status === 'accepted' ? 'success' : 'quiet'}>
                {STATUS_LABEL[r.status as 'accepted' | 'rejected' | 'expired']}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
