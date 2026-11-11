import type { BookingStatus, Meeting } from '@/lib/data';
import { getBookingProgress } from '@/lib/booking-progress';

export function BookingProgress({
  meetings,
  bookingStatus,
}: {
  meetings: readonly Meeting[];
  bookingStatus: BookingStatus;
}) {
  const { total, completed, inProgress, remaining, percent, inProgressPercent } =
    getBookingProgress(meetings);

  const statusText = total === 0
    ? 'Nenhum encontro ativo'
    : bookingStatus === 'cancelled'
      ? 'Reserva cancelada'
      : inProgress > 0
        ? `${inProgress} em aula`
        : remaining > 0
          ? `${remaining} ${remaining === 1 ? 'aula restante' : 'aulas restantes'}`
          : 'Aulas registradas';

  return (
    <div className="mt-4 border-t border-line pt-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-label">Progresso das aulas</p>
        <span className="tabular shrink-0 text-[13px] font-bold text-brand">{percent}%</span>
      </div>

      <div
        className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-track"
        role="progressbar"
        aria-label="Encontros concluídos"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${completed} de ${total} encontros concluídos`}
      >
        <span
          className="h-full bg-brand-bar transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
        {inProgressPercent > 0 ? (
          <span
            className="h-full bg-[#0ea5c6] transition-[width] duration-300"
            style={{ width: `${inProgressPercent}%` }}
          />
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
        <span className="font-medium text-label">
          {total === 0
            ? 'Sem aulas ativas'
            : `${completed} de ${total} ${total === 1 ? 'encontro concluído' : 'encontros concluídos'}`}
        </span>
        <span className={inProgress > 0 && bookingStatus !== 'cancelled'
          ? 'font-semibold text-[#0b6e99]' : 'text-muted'}>
          {statusText}
        </span>
      </div>
    </div>
  );
}
