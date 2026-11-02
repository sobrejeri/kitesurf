/** Compare proposed demo lessons against the same business rules as
 * public.instructor_can_attend (Migration 7), for human-readable diagnostics.
 * The PostgreSQL RPC is still the authoritative availability check.
 */
export type AdminDemoSlot = {
  starts_at: string;
  hours: number;
  epoch: number;
};
export type AdminWeeklyHour = {
  weekday: number;
  opens_at: string;
  closes_at: string;
};
export type AdminTimeOff = {
  starts_at: string;
  ends_at: string;
};
export type AdminBookedMeeting = {
  code: string;
  starts_at: string;
  minutes: number;
  status: 'confirmed' | 'awaiting_payment';
  booking_created_at: string;
};

const TIME_ZONE = 'America/Fortaleza';
const weekdayNames = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const weekdayIndexes: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function localParts(epoch: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(epoch));
  const get = (name: string) => parts.find((part) => part.type === name)?.value ?? '';
  return {
    day: get('day'), month: get('month'), year: get('year'),
    weekday: weekdayIndexes[get('weekday')] ?? -1,
    time: get('hour') + ':' + get('minute'),
  };
}

function rangesOverlap(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && otherStart < end;
}

/** Returns at most one actionable reason per rejected encounter. */
export function explainAdminDemoSchedule(
  slots: readonly AdminDemoSlot[],
  data: {
    configured: boolean;
    bufferMinutes: number;
    weekly: readonly AdminWeeklyHour[];
    timeOff: readonly AdminTimeOff[];
    booked: readonly AdminBookedMeeting[];
  },
  nowMs: number,
): string[] {
  const reasons: string[] = [];
  for (const [idx, slot] of slots.entries()) {
    const end = slot.epoch + slot.hours * 3600000;
    const startLoc = localParts(slot.epoch);
    const endLoc = localParts(end);
    const prefix = 'Encontro ' + (idx + 1) + ' (' + startLoc.day + '/' +
      startLoc.month + ' às ' + startLoc.time + '): ';
    if (data.configured && !data.weekly.some((hours) =>
      hours.weekday === startLoc.weekday
      && startLoc.year === endLoc.year
      && startLoc.month === endLoc.month
      && startLoc.day === endLoc.day
      && startLoc.time + ':00' >= hours.opens_at.slice(0,8)
      && endLoc.time + ':00' <= hours.closes_at.slice(0,8)
    )) {
      const available = data.weekly
        .filter((hours) => hours.weekday === startLoc.weekday)
        .map((hours) => hours.opens_at.slice(0,5) + '–' + hours.closes_at.slice(0,5));
      reasons.push(prefix + (available.length
        ? 'fora do turno cadastrado (' + available.join(', ') + '). Ajuste o horário ou a duração.'
        : 'o instrutor não atende às ' + (weekdayNames[startLoc.weekday] ?? 'data selecionada') +
          '. Escolha um dia disponível na agenda.'));
      continue;
    }

    const timeOff = data.timeOff.some((block) =>
      rangesOverlap(slot.epoch, end, Date.parse(block.starts_at), Date.parse(block.ends_at)));
    if (timeOff) {
      reasons.push(prefix + 'o instrutor bloqueou esse período na agenda. Escolha outra data ou horário.');
      continue;
    }
    const booked = data.booked.find((meeting) => {
      if (meeting.status === 'awaiting_payment'
        && Date.parse(meeting.booking_created_at) < nowMs - 10 * 60000) return false;
      const start = Date.parse(meeting.starts_at);
      return rangesOverlap(
        slot.epoch, end,
        start - data.bufferMinutes * 60000,
        start + (meeting.minutes + data.bufferMinutes) * 60000,
      );
    });
    if (booked) {
      reasons.push(prefix + 'conflito com a reserva ' + booked.code +
        '. Escolha um horário livre para este encontro.');
    }
  }
  return reasons;
}
