import { AVAILABILITY, EXTERNAL_BOOKINGS, INSTRUCTORS, INSTRUCTOR_RATE_VERSIONS, INVITATIONS, LESSONS, LESSON_HISTORY, LESSON_REQUESTS, OTHER_BUSY, SERVICES, UNITS, UNIT_SERVICES, type HistoryLesson, type InstructorRateVersion, type LessonRequest } from './demo.ts';
import type { BookingContext } from './bookings.ts';
import { effectivePriceCents, serviceOf } from './services.ts';

/**
 * One instructor, one calendar. Availability is the instructor's own weekly
 * window; lessons in any unit, in-person bookings and time taken by another
 * company all block it. Another company's booking is only ever "occupied":
 * its details are never exposed here.
 */
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const weekdayOf = (ctx: BookingContext, dayOffset: number): number => (((ctx.weekday0 + dayOffset) % 7) + 7) % 7;
export const WEEKDAY_NAME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;

export interface Busy { start: string; minutes: number; kind: 'here' | 'booking' | 'other' }
export const busyOf = (instructorId: string, dayOffset: number): Busy[] => [
  ...LESSONS.filter((l) => l.instructorId === instructorId && l.dayOffset === dayOffset).map((l): Busy => ({ start: l.start, minutes: l.minutes, kind: 'here' })),
  ...EXTERNAL_BOOKINGS.filter((b) => b.instructorId === instructorId && b.dayOffset === dayOffset && b.status !== 'cancelled').map((b): Busy => ({ start: b.start, minutes: b.minutes, kind: 'booking' })),
  ...OTHER_BUSY.filter((b) => b.instructorId === instructorId && b.dayOffset === dayOffset).map((b): Busy => ({ start: b.start, minutes: b.minutes, kind: 'other' })),
];
export const windowsOf = (instructorId: string, weekday: number) => AVAILABILITY.filter((w) => w.instructorId === instructorId && w.weekday === weekday);

/** True when the whole span sits inside a window and clashes with nothing, here or elsewhere. */
export function isFree(instructorId: string, dayOffset: number, start: string, minutes: number, ctx: BookingContext): boolean {
  const s = toMin(start); const e = s + minutes;
  if (!windowsOf(instructorId, weekdayOf(ctx, dayOffset)).some((w) => s >= toMin(w.from) && e <= toMin(w.to))) return false;
  return !busyOf(instructorId, dayOffset).some((b) => s < toMin(b.start) + b.minutes && toMin(b.start) < e);
}
/** Free start times (every 30 min) for a lesson of this length. */
export function freeStarts(instructorId: string, dayOffset: number, minutes: number, ctx: BookingContext): string[] {
  const out: string[] = [];
  for (const w of windowsOf(instructorId, weekdayOf(ctx, dayOffset))) for (let t = toMin(w.from); t + minutes <= toMin(w.to); t += 30) if (isFree(instructorId, dayOffset, fromMin(t), minutes, ctx)) out.push(fromMin(t));
  return out;
}

export const linkOf = (instructorId: string) => INSTRUCTORS.find((i) => i.id === instructorId);
/** Only an active link in this unit, with the service enabled for that instructor there, can receive the lesson. */
export function eligibleInstructors(r: LessonRequest, ctx: BookingContext): string[] {
  const service = serviceOf(r.serviceId); const cfg = UNIT_SERVICES.find((c) => c.serviceId === r.serviceId && c.unitId === r.unitId);
  if (!service || !cfg || !UNITS.some((u) => u.id === r.unitId && u.active)) return [];
  return cfg.instructorIds.filter((id) => { const l = linkOf(id); return l?.status === 'active' && l.unitIds.includes(r.unitId) && isFree(id, r.dayOffset, r.start, service.minutes, ctx); });
}

export interface QueueRow { instructorId: string; recent: number; lastOffset: number | null; vento: boolean }
/** Internal queue: whoever worked the least in the last 7 days goes first; ties go to who waited longer. */
export function queueFor(unitId: string, ids?: readonly string[]): QueueRow[] {
  const pool = INSTRUCTORS.filter((i) => i.status === 'active' && i.unitIds.includes(unitId) && (!ids || ids.includes(i.id)));
  return pool.map((i): QueueRow => {
    const mine = LESSON_HISTORY.filter((h) => h.instructorId === i.id && h.status === 'done');
    const recent = mine.filter((h) => h.dayOffset >= -7).length; const last = mine.length ? Math.max(...mine.map((h) => h.dayOffset)) : null;
    return { instructorId: i.id, recent, lastOffset: last, vento: i.independentQueue };
  }).sort((a, b) => a.recent - b.recent || (a.lastOffset ?? -999) - (b.lastOffset ?? -999) || a.instructorId.localeCompare(b.instructorId));
}
export const suggestions = (r: LessonRequest, ctx: BookingContext): string[] => queueFor(r.unitId, eligibleInstructors(r, ctx)).map((q) => q.instructorId);
export function validateAssignment(i: { requestId: string; instructorId: string }, ctx: BookingContext): Record<string, string> {
  const e: Record<string, string> = {}; const r = LESSON_REQUESTS.find((x) => x.id === i.requestId);
  if (!r) e.requestId = 'Pedido de aula não encontrado.';
  else if (!eligibleInstructors(r, ctx).includes(i.instructorId)) e.instructorId = 'Este instrutor não pode receber a aula: sem vínculo ativo, serviço ou horário livre.';
  return e;
}

export const rateVersionsOf = (instructorId: string): InstructorRateVersion[] => INSTRUCTOR_RATE_VERSIONS.filter((v) => v.instructorId === instructorId);
/** The unit's own version wins over the general one; the percentage is the one in force on that day. */
export function instructorRateAt(instructorId: string, unitId: string, dayOffset: number, versions: readonly InstructorRateVersion[] = INSTRUCTOR_RATE_VERSIONS): number {
  const latest = (scope: string) => versions.filter((v) => v.instructorId === instructorId && v.unitId === scope && v.fromOffset <= dayOffset).sort((a, b) => b.fromOffset - a.fromOffset)[0];
  return (latest(unitId) ?? latest('all'))?.bps ?? 0;
}
export function parsePercentToBps(text: string): number | null { const m = /^(\d{1,2})(?:[.,](\d))?$/.exec(text.trim()); return m ? Number(m[1]) * 100 + Number(m[2] ?? '0') * 10 : null; }
export function validateInstructorRate(i: { instructorId: string; scope: string; percent: string }): Record<string, string> {
  const e: Record<string, string> = {}; const l = linkOf(i.instructorId);
  if (!l) e.instructorId = 'Escolha o instrutor.';
  if (i.scope !== 'all' && !(l?.unitIds.includes(i.scope))) e.scope = 'Escolha todas as unidades ou uma unidade deste instrutor.';
  const bps = parsePercentToBps(i.percent);
  if (bps === null || bps < 1000 || bps > 9000) e.percent = 'Comissão de 10% a 90%, com no máximo uma casa decimal.';
  else if (!e.scope && l && bps === instructorRateAt(i.instructorId, i.scope === 'all' ? '' : i.scope, 0)) e.percent = 'Este já é o percentual vigente.';
  return e;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function validateInstructorInvite(i: { name: string; email: string; unitIds: readonly string[]; percent: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.name.trim().length < 3 || i.name.trim().length > 80) e.name = 'Informe o nome (3 a 80 letras).';
  if (!EMAIL.test(i.email.trim())) e.email = 'Informe um e-mail válido.';
  else if (INVITATIONS.some((v) => v.email === i.email.trim().toLowerCase() && v.status === 'pending')) e.email = 'Já existe um convite pendente para este e-mail.';
  if (i.unitIds.length === 0 || i.unitIds.some((u) => !UNITS.some((x) => x.id === u && x.active))) e.unitIds = 'Escolha ao menos uma unidade ativa.';
  const bps = parsePercentToBps(i.percent); if (bps === null || bps < 1000 || bps > 9000) e.percent = 'Comissão de 10% a 90%, com no máximo uma casa decimal.';
  return e;
}
export function validateResponse(i: { decision: string; reason: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.decision !== 'accept' && i.decision !== 'decline') e.decision = 'Escolha aceitar ou recusar.';
  if (i.reason.trim().length > 140) e.reason = 'O motivo pode ter até 140 caracteres.';
  return e;
}
export function validateAvailability(i: { weekday: string; from: string; to: string }): Record<string, string> {
  const e: Record<string, string> = {}; const wd = Number(i.weekday); const t = /^([01]\d|2[0-3]):(00|30)$/;
  if (!Number.isInteger(wd) || wd < 0 || wd > 6 || i.weekday === '') e.weekday = 'Escolha o dia da semana.';
  if (!t.test(i.from)) e.from = 'Início em hora cheia ou meia hora (ex.: 08:00).'; if (!t.test(i.to)) e.to = 'Fim em hora cheia ou meia hora (ex.: 16:30).';
  if (!e.from && !e.to && toMin(i.to) - toMin(i.from) < 60) e.to = 'A janela precisa ter ao menos 1 hora e terminar depois do início.';
  return e;
}

export const historyInScope = (unitIds: ReadonlySet<string>, instructorId = '', status = ''): HistoryLesson[] =>
  LESSON_HISTORY.filter((h) => unitIds.has(h.unitId) && (!instructorId || h.instructorId === instructorId) && (!status || h.status === status)).sort((a, b) => b.dayOffset - a.dayOffset);
const priceOf = (h: HistoryLesson): number => { const s = serviceOf(h.serviceId); const c = UNIT_SERVICES.find((x) => x.serviceId === h.serviceId && x.unitId === h.unitId); return s && c ? effectivePriceCents(s, c) : 0; };
export interface Performance { instructorId: string; done: number; cancelled: number; noShow: number; completionBps: number; minutes: number; baseCents: number; commissionCents: number }
export function performanceOf(instructorId: string, rows: readonly HistoryLesson[]): Performance {
  const mine = rows.filter((h) => h.instructorId === instructorId); const done = mine.filter((h) => h.status === 'done');
  const p: Performance = { instructorId, done: done.length, cancelled: mine.filter((h) => h.status === 'cancelled').length, noShow: mine.filter((h) => h.status === 'no_show').length, completionBps: 0, minutes: 0, baseCents: 0, commissionCents: 0 };
  for (const h of done) { p.minutes += serviceOf(h.serviceId)?.minutes ?? 0; p.baseCents += priceOf(h); p.commissionCents += Math.floor((priceOf(h) * h.commissionBps) / 10000); }
  p.completionBps = mine.length ? Math.floor((done.length * 10000) / mine.length) : 0;
  return p;
}
export const requestService = (r: LessonRequest) => SERVICES.find((s) => s.id === r.serviceId);
export const INVITE_STATUS: Record<string, string> = { pending: 'Aguardando resposta', accepted: 'Aceito', declined: 'Recusado', expired: 'Expirado' };
