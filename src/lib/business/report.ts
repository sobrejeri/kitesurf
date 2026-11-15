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
