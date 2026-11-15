import { AFFILIATE_SALES, AFFILIATE_SELECTIONS, COMPANY_AFFILIATES, PRODUCTS, RATE_VERSIONS, SERVICES, type AffiliateSale, type RateVersion } from './demo.ts';

/**
 * Commissions are tied to an eligible sale and use the percentage in force on
 * the day of the sale. A new percentage is a new version from its own day, so
 * it never rewrites earlier sales. Nothing here is ever "paid": paying
 * affiliates through VentoKite is not enabled, so the most a commission can be
 * is "a pagar".
 */
export type CommissionState = 'expected' | 'due' | 'cancelled' | 'refunded';
export const STATE_LABEL: Record<CommissionState, string> = { expected: 'Prevista', due: 'A pagar', cancelled: 'Cancelada', refunded: 'Estornada' };

/** Percentage (basis points) in force for an offer on a day: its own latest version, else the default one. */
export function rateAt(refId: string, dayOffset: number, versions: readonly RateVersion[] = RATE_VERSIONS): number {
  const latest = (scope: string) => versions.filter((v) => v.scope === scope && v.fromOffset <= dayOffset).sort((a, b) => b.fromOffset - a.fromOffset)[0];
  return (latest(refId) ?? latest('default'))?.bps ?? 0;
}
export const currentRate = (refId: string): number => rateAt(refId, 0);

export const eligibleBaseCents = (s: AffiliateSale): number => (s.status === 'cancelled' ? 0 : Math.max(0, s.baseCents - s.refundedCents));
export function commissionCents(s: AffiliateSale, versions: readonly RateVersion[] = RATE_VERSIONS): number {
  if (s.status === 'cancelled') return 0;
  return Math.floor((eligibleBaseCents(s) * rateAt(s.refId, s.dayOffset, versions)) / 10000);
}
export function commissionState(s: AffiliateSale): CommissionState {
  if (s.status === 'cancelled') return 'cancelled';
  if (s.status === 'refunded' || eligibleBaseCents(s) === 0) return 'refunded';
  return s.status === 'pending' ? 'expected' : 'due';
}
export const affiliateOf = (id: string) => COMPANY_AFFILIATES.find((a) => a.id === id);
/** A suspended affiliate stops earning on new sales; old sales keep their rights. */
export const canAttribute = (affiliateId: string): boolean => affiliateOf(affiliateId)?.status === 'active';

export const offerName = (refId: string): string => (refId === 'shop' ? 'Lojinha completa' : SERVICES.find((s) => s.id === refId)?.name ?? PRODUCTS.find((p) => p.id === refId)?.name ?? refId);
export const offerKind = (refId: string): string => (refId === 'shop' ? 'Lojinha' : refId.startsWith('s-') ? 'Serviço' : 'Produto');
export const OFFERS: readonly string[] = ['shop', ...SERVICES.map((s) => s.id), ...PRODUCTS.map((p) => p.id)];

export interface AffiliateTotals { sales: number; baseCents: number; expectedCents: number; dueCents: number; reversedCount: number }
export function totalsFor(sales: readonly AffiliateSale[]): AffiliateTotals {
  const t: AffiliateTotals = { sales: 0, baseCents: 0, expectedCents: 0, dueCents: 0, reversedCount: 0 };
  for (const s of sales) {
    const state = commissionState(s);
    if (state === 'cancelled' || state === 'refunded') { t.reversedCount += 1; continue; }
    t.sales += 1; t.baseCents += eligibleBaseCents(s);
    if (state === 'expected') t.expectedCents += commissionCents(s); else t.dueCents += commissionCents(s);
  }
  return t;
}
export const salesInScope = (unitIds: ReadonlySet<string>): AffiliateSale[] => AFFILIATE_SALES.filter((s) => unitIds.has(s.unitId));
export const selectionOf = (affiliateId: string): readonly string[] => AFFILIATE_SELECTIONS[affiliateId] ?? [];
export const promotersOf = (refId: string): number => COMPANY_AFFILIATES.filter((a) => selectionOf(a.id).includes(refId)).length;

/** "12" or "12,5" percent -> basis points, no floating point. */
export function parsePercentToBps(text: string): number | null {
  const m = /^(\d{1,2})(?:[.,](\d))?$/.exec(text.trim());
  return m ? Number(m[1]) * 100 + Number(m[2] ?? '0') * 10 : null;
}
export function validateRate(i: { scope: string; percent: string }, versions: readonly RateVersion[] = RATE_VERSIONS): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.scope !== 'default' && !OFFERS.includes(i.scope)) e.scope = 'Escolha o padrão ou um serviço, produto ou a lojinha.';
  const bps = parsePercentToBps(i.percent);
  if (bps === null || bps < 50 || bps > 3000) e.percent = 'Percentual de 0,5% a 30%, com no máximo uma casa decimal.';
  else if (!e.scope && bps === rateAt(i.scope, 0, versions) && versions.some((v) => v.scope === i.scope)) e.percent = 'Este já é o percentual vigente.';
  return e;
}
export function validateDecision(i: { decision: string; reason: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.decision !== 'approve' && i.decision !== 'decline') e.decision = 'Escolha aprovar ou recusar.';
  if (i.decision === 'decline' && i.reason.trim().length < 5) e.reason = 'Informe o motivo da recusa (mínimo 5 caracteres).';
  return e;
}
export function validateCampaign(i: { name: string; description: string; days: string; refs: readonly string[] }): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.name.trim().length < 3 || i.name.trim().length > 60) e.name = 'Nome da campanha de 3 a 60 letras.';
  if (i.description.trim().length > 140) e.description = 'A descrição pode ter até 140 caracteres.';
  const days = Number(i.days); if (!Number.isInteger(days) || days < 1 || days > 365) e.days = 'Validade de 1 a 365 dias.';
  if (i.refs.length === 0 || i.refs.some((r) => !OFFERS.includes(r))) e.refs = 'Escolha ao menos um item válido.';
  return e;
}
export const bpsLabel = (bps: number): string => `${Math.floor(bps / 100)}${bps % 100 ? `,${String((bps % 100) / 10)}` : ''}%`;
