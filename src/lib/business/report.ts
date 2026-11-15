import type { Cell } from './files.ts';
import { KIND_LABEL, METHOD_LABEL, type ClosingSummary } from './caixa.ts';
import { UNITS } from './demo.ts';
import { dayLabel } from './rules.ts';

const money = (c: number) => `${c < 0 ? '-' : ''}R$ ${Math.trunc(Math.abs(c) / 100).toLocaleString('pt-BR')},${String(Math.abs(c) % 100).padStart(2, '0')}`;
const STATUS = { ok: 'Caixa conferido, sem diferença', surplus: 'Sobra no caixa', shortage: 'Falta no caixa' } as const;

/** The same content feeds the Excel sheet and the PDF, so both always agree. */
export function closingSheetRows(c: ClosingSummary): Cell[][] {
  const unit = UNITS.find((u) => u.id === c.session.unitId)?.name ?? 'Unidade';
  const t = c.totals;
  return [
    [{ bold: 'Fechamento de caixa' }], ['Unidade', unit], ['Data', dayLabel(c.session.dayOffset)], ['Operador', c.session.operator], [],
    [{ bold: 'Resumo' }],
    ['Troco inicial', { cents: c.session.openingCents }], ['Vendas em dinheiro', { cents: t.salesCashCents }],
    ['Vendas Pix (recebido fora)', { cents: t.salesPixCents }], ['Vendas cartão (maquininha da escola)', { cents: t.salesCardCents }],
    ['Total vendido', { cents: t.salesTotalCents }], ['Suprimentos', { cents: t.suppliesCents }], ['Sangrias', { cents: t.bleedsCents }], ['Despesas', { cents: t.expensesCents }],
    ['Dinheiro esperado em caixa', { cents: c.expectedCents }], ['Dinheiro contado', { cents: c.countedCents }], ['Diferença', { cents: c.rec.differenceCents }],
    ['Situação', STATUS[c.rec.status]], ['Motivo da diferença', c.session.closing?.reason || '—'], [],
    [{ bold: 'Movimentações' }], [{ bold: 'Hora' }, { bold: 'Tipo' }, { bold: 'Forma' }, { bold: 'Descrição' }, { bold: 'Valor' }],
    ...c.movements.map((m): Cell[] => [m.time, KIND_LABEL[m.kind], m.method ? METHOD_LABEL[m.method] : '', m.note, { cents: m.cents }]),
    [], ['Pagamentos por Pix e cartão foram recebidos fora do VentoKite e apenas registrados.'],
  ];
}

export function closingPdfLines(c: ClosingSummary): string[] {
  const unit = UNITS.find((u) => u.id === c.session.unitId)?.name ?? 'Unidade';
  const t = c.totals; const row = (k: string, v: string) => `${k.padEnd(44, '.')} ${v.padStart(14)}`;
  return [
    'VENTOKITE BUSINESS - FECHAMENTO DE CAIXA', '', `Unidade: ${unit}`, `Data: ${dayLabel(c.session.dayOffset)}`, `Operador: ${c.session.operator}`, '', 'RESUMO',
    row('Troco inicial', money(c.session.openingCents)), row('Vendas em dinheiro', money(t.salesCashCents)), row('Vendas Pix (recebido fora)', money(t.salesPixCents)),
    row('Vendas cartão (maquininha da escola)', money(t.salesCardCents)), row('Total vendido', money(t.salesTotalCents)), row('Suprimentos', money(t.suppliesCents)),
    row('Sangrias', money(t.bleedsCents)), row('Despesas', money(t.expensesCents)), row('Dinheiro esperado em caixa', money(c.expectedCents)),
    row('Dinheiro contado', money(c.countedCents)), row('Diferença', money(c.rec.differenceCents)), `Situação: ${STATUS[c.rec.status]}`,
    `Motivo: ${c.session.closing?.reason || '-'}`, '', 'MOVIMENTAÇÕES',
    ...c.movements.map((m) => `${m.time}  ${KIND_LABEL[m.kind].padEnd(17)} ${(m.method ? METHOD_LABEL[m.method] : '').slice(0, 14).padEnd(14)} ${m.note.slice(0, 28).padEnd(28)} ${money(m.cents).padStart(12)}`),
    '', 'Pix e cartão foram recebidos fora do VentoKite e apenas registrados.',
  ];
}

// ---- Finance report (period, per unit, per instructor) ----
import { COMMISSION_ITEMS, INSTRUCTORS } from './demo.ts';
import { byUnit, instructorBalance, periodSummary } from './finance.ts';
import type { Scope } from './rules.ts';

const SETTLEMENT = { settled: 'Quitado', partial: 'Pago em parte', pending: 'Pendente' } as const;
function financeParts(scope: Scope, days: number) {
  const s = periodSummary(scope, days);
  const units = byUnit(scope, days);
  const instructors = [...new Set(COMMISSION_ITEMS.map((c) => c.instructorId))].map((id) => ({ name: INSTRUCTORS.find((i) => i.id === id)?.name ?? 'Instrutor', b: instructorBalance(id) }));
  return { s, units, instructors };
}
export function financeSheetRows(scope: Scope, days: number): Cell[][] {
  const { s, units, instructors } = financeParts(scope, days);
  return [
    [{ bold: 'Relatório financeiro (demonstração)' }], ['Período', `Últimos ${days} dias`], [],
    [{ bold: 'Resumo' }], ['Receitas', { cents: s.revenueCents }], ['Despesas', { cents: s.expenseCents }], ['Comissões devidas aos instrutores', { cents: s.commissionDueCents }], ['Resultado', { cents: s.resultCents }], [],
    [{ bold: 'Por unidade' }], [{ bold: 'Unidade' }, { bold: 'Receitas' }, { bold: 'Despesas' }, { bold: 'Comissões' }, { bold: 'Resultado' }],
    ...units.map((u): Cell[] => [u.name, { cents: u.revenueCents }, { cents: u.expenseCents }, { cents: u.commissionDueCents }, { cents: u.resultCents }]), [],
    [{ bold: 'Comissões por instrutor' }], [{ bold: 'Instrutor' }, { bold: 'Devido' }, { bold: 'Pago' }, { bold: 'Saldo' }, { bold: 'Situação' }],
    ...instructors.map(({ name, b }): Cell[] => [name, { cents: b.dueCents }, { cents: b.paidCents }, { cents: Math.max(0, b.balanceCents) }, SETTLEMENT[b.status]]), [],
    ['Os pagamentos aos instrutores são feitos pela escola, fora do VentoKite, e apenas registrados.'],
  ];
}
export function financePdfLines(scope: Scope, days: number): string[] {
  const { s, units, instructors } = financeParts(scope, days);
  const row = (k: string, v: number) => `${k.padEnd(44, '.')} ${money(v).padStart(14)}`;
  return [
    'VENTOKITE BUSINESS - RELATÓRIO FINANCEIRO (DEMONSTRAÇÃO)', '', `Período: últimos ${days} dias`, '', 'RESUMO', row('Receitas', s.revenueCents), row('Despesas', s.expenseCents),
    row('Comissões devidas aos instrutores', s.commissionDueCents), row('Resultado', s.resultCents), '', 'POR UNIDADE',
    ...units.map((u) => `${u.name.slice(0, 26).padEnd(26)} ${money(u.revenueCents).padStart(12)} ${money(u.expenseCents).padStart(12)} ${money(u.resultCents).padStart(14)}`), '', 'COMISSÕES POR INSTRUTOR',
    ...instructors.map(({ name, b }) => `${name.slice(0, 22).padEnd(22)} ${money(b.dueCents).padStart(11)} ${money(b.paidCents).padStart(11)} ${SETTLEMENT[b.status].padStart(14)}`), '',
    'Pagamentos aos instrutores são feitos pela escola, fora do VentoKite.',
  ];
}
