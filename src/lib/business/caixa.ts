import { CASH_MOVEMENTS, CASH_SESSIONS, type CashMovement, type CashSession, type MovementKind, type PaymentMethod } from './demo.ts';
import { parseMoneyToCents } from './services.ts';

/** All money here is integer cents. Cash on hand depends only on cash movements; Pix and card are external and only recorded. */
export interface SessionTotals {
  salesCashCents: number; salesPixCents: number; salesCardCents: number; salesTotalCents: number;
  suppliesCents: number; bleedsCents: number; expensesCents: number;
}
const sum = (list: readonly CashMovement[], pick: (m: CashMovement) => boolean) => list.filter(pick).reduce((t, m) => t + m.cents, 0);

export function sessionTotals(movements: readonly CashMovement[]): SessionTotals {
  const sale = (method: PaymentMethod) => sum(movements, (m) => m.kind === 'sale' && m.method === method);
  const salesCashCents = sale('cash'); const salesPixCents = sale('pix_external'); const salesCardCents = sale('card_external');
  return {
    salesCashCents, salesPixCents, salesCardCents, salesTotalCents: salesCashCents + salesPixCents + salesCardCents,
    suppliesCents: sum(movements, (m) => m.kind === 'supply'), bleedsCents: sum(movements, (m) => m.kind === 'bleed'), expensesCents: sum(movements, (m) => m.kind === 'expense'),
  };
}
export const expectedCashCents = (openingCents: number, t: SessionTotals): number => openingCents + t.salesCashCents + t.suppliesCents - t.bleedsCents - t.expensesCents;

export type Reconciliation = { differenceCents: number; status: 'ok' | 'surplus' | 'shortage' };
export function reconcile(expectedCents: number, countedCents: number): Reconciliation {
  const differenceCents = countedCents - expectedCents;
  return { differenceCents, status: differenceCents === 0 ? 'ok' : differenceCents > 0 ? 'surplus' : 'shortage' };
}

export const movementsOf = (sessionId: string): CashMovement[] => CASH_MOVEMENTS.filter((m) => m.sessionId === sessionId);
export const sessionById = (id: string): CashSession | undefined => CASH_SESSIONS.find((s) => s.id === id);
export interface ClosingSummary { session: CashSession; totals: SessionTotals; expectedCents: number; countedCents: number; rec: Reconciliation; movements: CashMovement[] }
export function closingSummary(session: CashSession): ClosingSummary | null {
  if (!session.closing) return null;
  const movements = movementsOf(session.id); const totals = sessionTotals(movements);
  const expectedCents = expectedCashCents(session.openingCents, totals);
  return { session, totals, expectedCents, countedCents: session.closing.countedCents, rec: reconcile(expectedCents, session.closing.countedCents), movements };
}

export const KIND_LABEL: Record<MovementKind, string> = { sale: 'Venda presencial', supply: 'Suprimento', bleed: 'Sangria', expense: 'Despesa' };
export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Dinheiro', pix_external: 'Pix (recebido fora)', card_external: 'Cartão (maquininha da escola)' };

export function validateOpening(i: { unitId: string; opening: string; operator: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!i.unitId) e.unitId = 'Escolha a unidade.';
  else if (CASH_SESSIONS.some((s) => s.unitId === i.unitId && !s.closing)) e.unitId = 'Esta unidade já tem um caixa aberto.';
  const c = parseMoneyToCents(i.opening);
  if (c === null || c > 5_000_000) e.opening = 'Informe o troco inicial em reais (pode ser 0), com até 2 casas.';
  if (i.operator.trim().length < 3) e.operator = 'Informe quem está abrindo o caixa.';
  return e;
}
export function validateMovement(i: { kind: string; method: string; amount: string; note: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!['sale', 'supply', 'bleed', 'expense'].includes(i.kind)) e.kind = 'Escolha o tipo da movimentação.';
  if (i.kind === 'sale' && !['cash', 'pix_external', 'card_external'].includes(i.method)) e.method = 'Informe como o cliente pagou.';
  const c = parseMoneyToCents(i.amount);
  if (c === null || c < 1) e.amount = 'Informe um valor maior que zero, com até 2 casas.';
  if (i.note.trim().length < 3) e.note = 'Descreva a movimentação (mínimo 3 letras).';
  return e;
}
/** Closing needs the counted cash; a difference needs a reason. */
export function validateClosing(i: { counted: string; reason: string; expectedCents: number }): Record<string, string> {
  const e: Record<string, string> = {};
  const c = parseMoneyToCents(i.counted);
  if (c === null) { e.counted = 'Informe o valor contado em dinheiro, com até 2 casas.'; return e; }
  if (c !== i.expectedCents && i.reason.trim().length < 8) e.reason = 'Há diferença no caixa: explique o motivo (mínimo 8 caracteres).';
  return e;
}

/** Thermal receipts: 32 columns on 58 mm paper, 48 on 80 mm. */
export type ThermalWidth = 58 | 80;
export const thermalColumns = (w: ThermalWidth): number => (w === 58 ? 32 : 48);
export function thermalWrap(text: string, cols: number): string[] {
  const out: string[] = []; let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > cols) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, cols)); w = w.slice(cols); }
    if (!line) line = w; else if (line.length + 1 + w.length <= cols) line += ` ${w}`; else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}
export const thermalCenter = (t: string, cols: number): string => thermalWrap(t, cols).map((l) => ' '.repeat(Math.floor((cols - l.length) / 2)) + l).join('\n');
export function thermalRow(left: string, right: string, cols: number): string {
  const room = cols - right.length - 1;
  const l = left.length > room ? `${left.slice(0, Math.max(0, room - 1))}.` : left;
  return l + ' '.repeat(Math.max(1, cols - l.length - right.length)) + right;
}
export function thermalReceipt(title: string, rows: readonly (readonly [string, string])[], note: string, width: ThermalWidth): string {
  const cols = thermalColumns(width); const rule = '-'.repeat(cols);
  return [thermalCenter('VENTOKITE BUSINESS', cols), thermalCenter(title.toUpperCase(), cols), rule, ...rows.map(([k, v]) => thermalRow(k, v, cols)), rule, ...thermalWrap(note, cols), '', thermalCenter('Documento sem valor fiscal', cols)].join('\n');
}
