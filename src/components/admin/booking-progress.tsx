import type { BookingStatus, Meeting } from '@/lib/data';
import { getBookingProgress } from '@/lib/booking-progress';

export function BookingProgress({
  meetings,
  bookingStatus,
  totalHours,
}: {
  meetings: readonly Meeting[];
  bookingStatus: BookingStatus;
  totalHours: number;
}) {
  const { total, completed, inProgress, remaining, percent, inProgressPercent } =
    getBookingProgress(meetings);

  const contractedMinutes = Math.max(0, Math.round(totalHours * 60));
  const deliveredMinutes = meetings.filter((meeting) => meeting.status === 'done')
    .reduce((sum, meeting) => sum + Math.max(0, meeting.done_minutes || 0), 0);
  const remainingMinutes = Math.max(0, contractedMinutes - deliveredMinutes);
  const timePercent = contractedMinutes
    ? Math.min(100, Math.round((deliveredMinutes / contractedMinutes) * 10000) / 100)
    : 0;
  const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;

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
        <p className="text-[12px] font-semibold text-label">Progresso dos encontros</p>
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
      {contractedMinutes > 0 && bookingStatus !== 'cancelled' ? (
        <div className="mt-3 border-t border-line pt-3" aria-label="Progresso por horas">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold text-label">Horas realizadas</p>
            <span className="tabular text-[13px] font-bold text-brand">{timePercent}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-track" role="progressbar" aria-label="Horas realizadas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={timePercent} aria-valuetext={`${deliveredMinutes} de ${contractedMinutes} minutos realizados`}>
            <span className="block h-full bg-brand-bar" style={{ width: `${timePercent}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] text-label">
            <span>{formatDuration(deliveredMinutes)} de {formatDuration(contractedMinutes)} realizadas</span>
            <span>{formatDuration(remainingMinutes)} restantes</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
