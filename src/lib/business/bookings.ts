import { EXTERNAL_BOOKINGS, LESSONS, UNITS, UNIT_SERVICES, type ExternalBooking } from './demo.ts';
import { effectivePriceCents, serviceOf } from './services.ts';
import { endTime } from './rules.ts';

/**
 * In-person bookings use the same agenda checks as digital ones: one
 * instructor, one calendar, across units, schools and origins.
 */
export interface BookingContext { weekday0: number; nowMinutes: number }
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Weekday (0 = Sunday) and minutes since midnight in Fortaleza time. */
export function currentContext(now = new Date()): BookingContext {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday0 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekday0, nowMinutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

interface Busy { instructorId: string; dayOffset: number; start: string; minutes: number }
const busyList = (ignoreId?: string): Busy[] => [
  ...LESSONS,
  ...EXTERNAL_BOOKINGS.filter((b) => b.status !== 'cancelled' && b.id !== ignoreId),
];

export interface SlotQuery { unitId: string; serviceId: string; instructorId: string; dayOffset: number; ignoreBookingId?: string }

/** Free start times (every 30 min) for this unit, service, instructor and day. */
export function availableSlots(q: SlotQuery, ctx: BookingContext): string[] {
  const unit = UNITS.find((u) => u.id === q.unitId);
  const config = UNIT_SERVICES.find((u) => u.serviceId === q.serviceId && u.unitId === q.unitId);
  const service = serviceOf(q.serviceId);
  if (!unit || !unit.active || !config || !service || !config.instructorIds.includes(q.instructorId)) return [];
  if (q.dayOffset < 0 || q.dayOffset > 30) return [];
  if (!config.weekdays.includes((ctx.weekday0 + q.dayOffset) % 7)) return [];
  const busy = busyList(q.ignoreBookingId).filter((b) => b.instructorId === q.instructorId && b.dayOffset === q.dayOffset);
  const slots: string[] = [];
  for (let t = toMin(unit.opens); t + service.minutes <= toMin(unit.closes); t += 30) {
    if (q.dayOffset === 0 && t < ctx.nowMinutes + 60) continue; // at least one hour ahead, as for digital bookings
    if (busy.some((b) => t < toMin(b.start) + b.minutes && toMin(b.start) < t + service.minutes)) continue;
    slots.push(fromMin(t));
  }
  return slots;
}

export interface BookingInput extends SlotQuery { start: string; name: string; phone: string }
export function validateBooking(input: BookingInput, ctx: BookingContext): Record<string, string> {
  const e: Record<string, string> = {};
  if (!UNITS.some((u) => u.id === input.unitId && u.active)) e.unitId = 'Escolha uma unidade ativa.';
  const config = UNIT_SERVICES.find((u) => u.serviceId === input.serviceId && u.unitId === input.unitId);
  if (!config) e.serviceId = 'Este serviço não está habilitado nesta unidade.';
  else if (!config.instructorIds.includes(input.instructorId)) e.instructorId = 'Este instrutor não atende este serviço nesta unidade.';
  if (!e.unitId && !e.serviceId && !e.instructorId && !availableSlots(input, ctx).includes(input.start)) e.start = 'Escolha um horário livre.';
  if (input.name.trim().length < 3 || input.name.trim().length > 80) e.name = 'Informe o nome do cliente (3 a 80 letras).';
  const digits = input.phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) e.phone = 'Informe um telefone com DDD.';
  return e;
}

export const bookingEnd = (b: ExternalBooking): string => endTime(b.start, b.minutes);
export const bookingPrice = (unitId: string, serviceId: string): number => {
  const service = serviceOf(serviceId);
  const config = UNIT_SERVICES.find((u) => u.serviceId === serviceId && u.unitId === unitId);
  return service && config ? effectivePriceCents(service, config) : 0;
};
export const externalById = (id: string): ExternalBooking | undefined => EXTERNAL_BOOKINGS.find((b) => b.id === id);
export const STATUS_LABEL: Record<ExternalBooking['status'], string> = { confirmed: 'Confirmada', done: 'Realizada', cancelled: 'Cancelada' };
