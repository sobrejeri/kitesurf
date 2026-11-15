import { COMMISSION_ITEMS, EXTERNAL_PAYMENTS, FIN_ENTRIES, PAYABLES, RECEIVABLES, UNITS, EMPLOYEES, CASH_SESSIONS, type ExternalMethod, type FinEntry, type Payable, type Receivable } from './demo.ts';
import { parseMoneyToCents } from './services.ts';
import type { Scope } from './rules.ts';

/**
 * Finance of the school. Integer cents everywhere. The school pays its
 * instructors by itself, outside VentoKite: nothing here moves money; it
 * calculates what is owed, records payments made elsewhere and tracks them.
 */
const unitIds = (scope: Scope): Set<string> => new Set(UNITS.filter((u) => (!scope.cidade || u.city === scope.cidade) && (!scope.unidade || u.id === scope.unidade)).map((u) => u.id));

/** The instructor's share, rounded once; the school keeps the rest by subtraction, so the parts always add up. */
export const commissionCents = (baseCents: number, bps: number): number => Math.round((baseCents * bps) / 10000);
export const schoolShareCents = (baseCents: number, bps: number): number => baseCents - commissionCents(baseCents, bps);

export type SettlementStatus = 'settled' | 'partial' | 'pending';
export interface Balance { dueCents: number; paidCents: number; balanceCents: number; status: SettlementStatus; unconfirmedCents: number }
/** Company-wide balance: payments are made to the person, not to a unit, so the unit filter never splits it. */
export function instructorBalance(instructorId: string): Balance {
  const dueCents = COMMISSION_ITEMS.filter((c) => c.instructorId === instructorId).reduce((t, c) => t + commissionCents(c.baseCents, c.commissionBps), 0);
  const mine = EXTERNAL_PAYMENTS.filter((p) => p.instructorId === instructorId);
  const paidCents = mine.reduce((t, p) => t + p.cents, 0);
  const balanceCents = dueCents - paidCents;
  return { dueCents, paidCents, balanceCents, status: balanceCents <= 0 && dueCents > 0 ? 'settled' : paidCents > 0 ? 'partial' : 'pending', unconfirmedCents: mine.filter((p) => !p.confirmed).reduce((t, p) => t + p.cents, 0) };
}

export type DueStatus = 'paid' | 'partial' | 'overdue' | 'open';
export function dueStatus(item: { dueOffset: number; cents: number }, settledCents: number): DueStatus {
  if (settledCents >= item.cents) return 'paid';
  if (item.dueOffset < 0) return 'overdue';
  return settledCents > 0 ? 'partial' : 'open';
}
export const receivableStatus = (r: Receivable): DueStatus => dueStatus(r, r.receivedCents);
export const payableStatus = (p: Payable): DueStatus => dueStatus(p, p.paidCents);

/** Instructors with lessons in the filtered units. */
export const instructorsWithLessons = (scope: Scope): string[] => { const ids = unitIds(scope); return [...new Set(COMMISSION_ITEMS.filter((c) => ids.has(c.unitId)).map((c) => c.instructorId))]; };
export const entriesInScope = (scope: Scope, kind?: FinEntry['kind'], days = 3650): FinEntry[] => {
  const ids = unitIds(scope);
  return FIN_ENTRIES.filter((e) => ids.has(e.unitId) && (!kind || e.kind === kind) && e.dayOffset >= -days);
};
export const receivablesInScope = (scope: Scope): Receivable[] => { const ids = unitIds(scope); return RECEIVABLES.filter((r) => ids.has(r.unitId)); };
export const payablesInScope = (scope: Scope): Payable[] => { const ids = unitIds(scope); return PAYABLES.filter((p) => ids.has(p.unitId)); };

export interface PeriodSummary { revenueCents: number; expenseCents: number; commissionDueCents: number; resultCents: number; commissionPaidCents: number }
/** Period closing: revenue minus expenses minus the commissions earned in the period. */
export function periodSummary(scope: Scope, days: number): PeriodSummary {
  const entries = entriesInScope(scope, undefined, days); const ids = unitIds(scope);
  const revenueCents = entries.filter((e) => e.kind === 'revenue').reduce((t, e) => t + e.cents, 0);
  const expenseCents = entries.filter((e) => e.kind === 'expense').reduce((t, e) => t + e.cents, 0);
  const commissionDueCents = COMMISSION_ITEMS.filter((c) => ids.has(c.unitId) && c.dayOffset >= -days).reduce((t, c) => t + commissionCents(c.baseCents, c.commissionBps), 0);
  const commissionPaidCents = EXTERNAL_PAYMENTS.filter((p) => p.dayOffset >= -days).reduce((t, p) => t + p.cents, 0);
  return { revenueCents, expenseCents, commissionDueCents, commissionPaidCents, resultCents: revenueCents - expenseCents - commissionDueCents };
}

export function byUnit(scope: Scope, days: number) {
  return UNITS.filter((u) => unitIds(scope).has(u.id)).map((u) => {
    const s = periodSummary({ cidade: '', unidade: u.id }, days);
    return { id: u.id, name: u.name, city: u.city, ...s };
  });
}
export function byEmployee(scope: Scope, days: number) {
  const entries = entriesInScope(scope, undefined, days);
  return EMPLOYEES.map((e) => {
    const mine = entries.filter((x) => x.employeeId === e.id);
    return { id: e.id, name: e.name, revenueCents: mine.filter((x) => x.kind === 'revenue').reduce((t, x) => t + x.cents, 0), expenseCents: mine.filter((x) => x.kind === 'expense').reduce((t, x) => t + x.cents, 0), entries: mine.length, registers: CASH_SESSIONS.filter((s) => s.operator === e.name).length };
  }).filter((r) => r.entries > 0 || r.registers > 0);
}

export const METHOD_NAME: Record<ExternalMethod, string> = { pix: 'Pix', ted: 'Transferência (TED)', cash: 'Dinheiro' };
/** An external payment is a record only: never more than what is owed, never zero, always with a reference. */
export function validateExternalPayment(i: { instructorId: string; amount: string; method: string; reference: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!COMMISSION_ITEMS.some((c) => c.instructorId === i.instructorId)) { e.instructorId = 'Escolha o instrutor.'; return e; }
  const cents = parseMoneyToCents(i.amount);
  const b = instructorBalance(i.instructorId);
  if (cents === null || cents < 1) e.amount = 'Informe o valor pago, maior que zero, com até 2 casas.';
  else if (cents > b.balanceCents) e.amount = 'O valor é maior que o saldo devido a este instrutor.';
  if (!['pix', 'ted', 'cash'].includes(i.method)) e.method = 'Informe como foi pago.';
  if (i.reference.trim().length < 3) e.reference = 'Informe a referência do comprovante (mínimo 3 caracteres).';
  return e;
}
