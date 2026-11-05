import { ActionForm } from '@/components/action-form';
import { respondBalanceMeeting } from '@/app/actions/balance';
import { Card, Note } from '@/components/ui';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';

export type PendingBalanceItem = {
  id: string;
  bookingId: string;
  code: string;
  studentName: string;
  proposedStartsAt: string;
  minutes: number;
};

/**
 * Pending make-up requests the student proposed for their paid balance. The
 * assigned instructor confirms or declines; confirming adds the lesson to the
 * agenda with no new charge. All authorization stays in the RPC.
 */
export function InstructorBalanceRequests({ items }: { items: PendingBalanceItem[] }) {
  if (!items.length) return null;
  return (
    <Card className="mb-5 border-brand/40">
      <h2 className="text-[16px]">Aulas de reposição pedidas</h2>
      <p className="mt-1 text-[12px] text-muted">
        O aluno quer usar horas já pagas que ficaram sem registro. Confirme uma data ou recuse — sem nova cobrança.
      </p>
      <ul className="mt-4 grid gap-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-search border border-line px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">
                  {item.studentName} · {formatMinutes(item.minutes)}
                </p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {formatDateLong(item.proposedStartsAt)} · {formatTime(item.proposedStartsAt)} · Reserva {item.code}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ActionForm action={respondBalanceMeeting} submitLabel="Confirmar" submitVariant="primary" wideSubmit>
                <input type="hidden" name="requestId" value={item.id} />
                <input type="hidden" name="bookingId" value={item.bookingId} />
                <input type="hidden" name="decision" value="accept" />
              </ActionForm>
              <ActionForm action={respondBalanceMeeting} submitLabel="Recusar" submitVariant="ghost" wideSubmit>
                <input type="hidden" name="requestId" value={item.id} />
                <input type="hidden" name="bookingId" value={item.bookingId} />
                <input type="hidden" name="decision" value="reject" />
              </ActionForm>
            </div>
          </li>
        ))}
      </ul>
      <Note className="mt-3" icon="info">
        A aula de reposição usa o saldo já pago desta reserva. Nenhum valor é cobrado.
      </Note>
    </Card>
  );
}
