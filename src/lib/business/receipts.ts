import { KIND_LABEL, METHOD_LABEL, closingSummary, sessionById, thermalReceipt, type ThermalWidth } from './caixa.ts';
import { CASH_MOVEMENTS, PRINT_PURPOSES, UNITS, type PrintPurpose } from './demo.ts';
import { dayLabel } from './rules.ts';

const money = (c: number) => `R$ ${Math.trunc(c / 100)},${String(c % 100).padStart(2, '0')}`;
export interface ReceiptData { title: string; rows: [string, string][]; note: string }

/** Make the demonstration unmistakable even after the paper is printed. */
export function sampleThermalReceipt(kind: PrintPurpose, sessionId: string, width: ThermalWidth): string {
  const receipt = sampleReceipt(kind, sessionId);
  return thermalReceipt(`DEMONSTRAÇÃO - ${receipt.title}`, receipt.rows, receipt.note, width);
}

/** Example content for each thermal receipt, from the demonstration data. */
export function sampleReceipt(kind: PrintPurpose, sessionId = 'cs-2'): ReceiptData {
  const s = sessionById(sessionId); const unit = UNITS.find((u) => u.id === s?.unitId)?.name ?? 'Unidade';
  const pick = (k: 'sale' | 'bleed' | 'supply') => CASH_MOVEMENTS.find((m) => m.kind === k && m.sessionId === sessionId) ?? CASH_MOVEMENTS.find((m) => m.kind === k);
  const label = PRINT_PURPOSES.find((p) => p.id === kind)?.label ?? kind;
  if (kind === 'closing') {
    const c = s ? closingSummary(s) : null;
    if (!c) return { title: label, rows: [['Unidade', unit], ['Situação', 'Caixa aberto']], note: 'Feche o caixa para imprimir o resumo.' };
    return { title: label, rows: [['Unidade', unit], ['Data', dayLabel(s?.dayOffset ?? 0)], ['Operador', c.session.operator], ['Troco inicial', money(c.session.openingCents)], ['Vendas', money(c.totals.salesTotalCents)],
      ['Suprimentos', money(c.totals.suppliesCents)], ['Sangrias', money(c.totals.bleedsCents)], ['Despesas', money(c.totals.expensesCents)], ['Esperado', money(c.expectedCents)], ['Contado', money(c.countedCents)],
      ['Diferença', `${c.rec.differenceCents < 0 ? '-' : ''}${money(Math.abs(c.rec.differenceCents))}`]], note: c.session.closing?.reason ? `Motivo: ${c.session.closing.reason}` : 'Caixa conferido.' };
  }
  const m = kind === 'bleed' ? pick('bleed') : kind === 'supply' ? pick('supply') : pick('sale');
  const base: [string, string][] = [['Unidade', unit], ['Data', dayLabel(s?.dayOffset ?? 0)]];
  if (kind === 'sale') return { title: label, rows: [...base, ['Item', m?.note ?? 'Aula'], ['Forma', m?.method ? METHOD_LABEL[m.method] : 'Dinheiro'], ['Total', money(m?.cents ?? 0)]], note: 'Obrigado pela preferência.' };
  if (kind === 'booking') return { title: label, rows: [...base, ['Reserva', 'PRE-0001'], ['Serviço', 'Aula iniciante'], ['Quando', 'ter., 09:00-11:00'], ['Valor', money(28000)]], note: 'Reserva presencial. Pagamento combinado no balcão.' };
  if (kind === 'rental') return { title: label, rows: [...base, ['Equipamento', 'Prancha 01'], ['Período', '2 horas'], ['Valor', money(8000)]], note: 'Devolver no balcão. Demonstração: o estoque ainda não está ligado.' };
  if (kind === 'external_payment') return { title: label, rows: [...base, ['Forma', 'Pix (recebido fora)'], ['Valor', money(26000)]], note: 'Pagamento recebido fora do VentoKite e apenas registrado.' };
  return { title: `${label} (${KIND_LABEL[kind === 'bleed' ? 'bleed' : 'supply']})`, rows: [...base, ['Descrição', m?.note ?? ''], ['Valor', money(m?.cents ?? 0)]], note: 'Assinatura: ______________________' };
}
