import { EQUIPMENT, MAINTENANCE, PRODUCTS, RENTALS, STOCK_MOVEMENTS, UNITS, type Condition, type Equipment, type EquipmentType, type Product, type Rental, type StockMovement } from './demo.ts';
import { parseMoneyToCents } from './services.ts';
import type { Scope } from './rules.ts';

/**
 * Stock is a ledger: the quantity of a product in a unit is the sum of its
 * movements, so it can never disagree with its own history. Equipment is
 * identified one by one; its availability is derived from rentals and
 * maintenance tickets, never typed in by hand.
 */
const activeUnitIds = (scope: Scope): string[] => UNITS.filter((u) => u.active && (!scope.cidade || u.city === scope.cidade) && (!scope.unidade || u.id === scope.unidade)).map((u) => u.id);
export const stockUnits = activeUnitIds;

export const productStock = (productId: string, unitId: string, ledger: readonly StockMovement[] = STOCK_MOVEMENTS): number =>
  ledger.filter((m) => m.productId === productId && m.unitId === unitId).reduce((t, m) => t + m.qty, 0);
export const totalStock = (productId: string, scope: Scope, ledger: readonly StockMovement[] = STOCK_MOVEMENTS): number =>
  activeUnitIds(scope).reduce((t, u) => t + productStock(productId, u, ledger), 0);
export const isLow = (p: Product, unitId: string): boolean => productStock(p.id, unitId) <= p.minStock;
export const lowStockRows = (scope: Scope): { product: Product; unitId: string; qty: number }[] =>
  PRODUCTS.flatMap((product) => activeUnitIds(scope).filter((u) => isLow(product, u)).map((unitId) => ({ product, unitId, qty: productStock(product.id, unitId) })));

/** A transfer is two movements with the same id, so the total across units never changes. */
export function transferMovements(i: { productId: string; fromUnit: string; toUnit: string; qty: number; id: string; dayOffset: number }): StockMovement[] {
  return [
    { id: `${i.id}-out`, productId: i.productId, unitId: i.fromUnit, type: 'transfer_out', qty: -i.qty, dayOffset: i.dayOffset, note: 'Transferência enviada', transferId: i.id },
    { id: `${i.id}-in`, productId: i.productId, unitId: i.toUnit, type: 'transfer_in', qty: i.qty, dayOffset: i.dayOffset, note: 'Transferência recebida', transferId: i.id },
  ];
}
const isInt = (s: string) => /^-?\d{1,6}$/.test(s.trim());

export function validateTransfer(i: { productId: string; fromUnit: string; toUnit: string; qty: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!PRODUCTS.some((p) => p.id === i.productId)) e.productId = 'Escolha o produto.';
  const units = UNITS.filter((u) => u.active).map((u) => u.id);
  if (!units.includes(i.fromUnit)) e.fromUnit = 'Escolha a unidade de origem.';
  if (!units.includes(i.toUnit)) e.toUnit = 'Escolha a unidade de destino.';
  else if (i.fromUnit === i.toUnit) e.toUnit = 'A origem e o destino precisam ser diferentes.';
  if (!isInt(i.qty) || Number(i.qty) < 1) e.qty = 'Informe uma quantidade inteira maior que zero.';
  else if (!e.productId && !e.fromUnit && Number(i.qty) > productStock(i.productId, i.fromUnit)) e.qty = `A origem só tem ${productStock(i.productId, i.fromUnit)} em estoque.`;
  return e;
}
export function validateStockMovement(i: { productId: string; unitId: string; type: string; qty: string; note: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (!PRODUCTS.some((p) => p.id === i.productId)) e.productId = 'Escolha o produto.';
  if (!UNITS.some((u) => u.active && u.id === i.unitId)) e.unitId = 'Escolha a unidade.';
  if (!['in', 'sale', 'adjust'].includes(i.type)) e.type = 'Escolha o tipo.';
  const q = Number(i.qty);
  if (!isInt(i.qty) || q === 0 || (i.type !== 'adjust' && q < 0)) e.qty = i.type === 'adjust' ? 'Informe a diferença, positiva ou negativa, diferente de zero.' : 'Informe uma quantidade inteira maior que zero.';
  else if (!e.productId && !e.unitId && i.type !== 'in') { const delta = i.type === 'sale' ? -Math.abs(q) : q; if (productStock(i.productId, i.unitId) + delta < 0) e.qty = 'O estoque ficaria negativo.'; }
  if (i.note.trim().length < 3) e.note = 'Descreva o motivo (mínimo 3 letras).';
  return e;
}
export function validateProduct(i: { name: string; sku: string; price: string; min: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.name.trim().length < 3 || i.name.trim().length > 60) e.name = 'Informe o nome (3 a 60 letras).';
  if (!/^[A-Z0-9-]{3,12}$/.test(i.sku.trim().toUpperCase())) e.sku = 'O código usa de 3 a 12 letras, números ou hífen.';
  else if (PRODUCTS.some((p) => p.sku === i.sku.trim().toUpperCase())) e.sku = 'Já existe um produto com este código.';
  const c = parseMoneyToCents(i.price); if (c === null || c < 100) e.price = 'Informe o preço em reais (mínimo R$ 1,00), com até 2 casas.';
  if (!isInt(i.min) || Number(i.min) < 0) e.min = 'Informe o estoque mínimo (0 ou mais).';
  return e;
}

// ---- Equipment, rentals, maintenance ----
export const CONDITION_RANK: Record<Condition, number> = { novo: 0, bom: 1, regular: 2, ruim: 3 };
export const CONDITION_LABEL: Record<Condition, string> = { novo: 'Novo', bom: 'Bom', regular: 'Regular', ruim: 'Ruim' };
export const TYPE_LABEL: Record<EquipmentType, string> = { prancha: 'Prancha', pipa: 'Pipa', trapezio: 'Trapézio', colete: 'Colete', capacete: 'Capacete' };
export const HOURLY_CENTS: Record<EquipmentType, number> = { prancha: 4000, pipa: 8000, trapezio: 2500, colete: 1500, capacete: 1000 };

export type EquipmentStatus = 'available' | 'rented' | 'maintenance' | 'retired';
export const activeRental = (equipmentId: string, rentals: readonly Rental[] = RENTALS): Rental | undefined => rentals.find((r) => r.equipmentId === equipmentId && !r.returned);
export function equipmentStatus(eq: Equipment, rentals: readonly Rental[] = RENTALS): EquipmentStatus {
  if (eq.retired) return 'retired';
  if (MAINTENANCE.some((m) => m.equipmentId === eq.id && m.status === 'open')) return 'maintenance';
  return activeRental(eq.id, rentals) ? 'rented' : 'available';
}
export const STATUS_LABEL: Record<EquipmentStatus, string> = { available: 'Disponível', rented: 'Alugado', maintenance: 'Em manutenção', retired: 'Aposentado' };
export const equipmentInScope = (scope: Scope): Equipment[] => { const ids = new Set(activeUnitIds(scope)); return EQUIPMENT.filter((e) => ids.has(e.unitId) || (e.retired && UNITS.some((u) => u.id === e.unitId && (!scope.unidade || u.id === scope.unidade) && (!scope.cidade || u.city === scope.cidade)))); };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export type RentalState = 'active' | 'overdue' | 'returned';
/** Overdue when the agreed time has passed and the item is still out; anything out since a previous day is overdue. */
export function rentalState(r: Rental, nowMinutes: number): RentalState {
  if (r.returned) return 'returned';
  if (r.dayOffset < 0) return 'overdue';
  return nowMinutes > toMin(r.start) + r.hours * 60 ? 'overdue' : 'active';
}
export const rentalPrice = (type: EquipmentType, hours: number): number => HOURLY_CENTS[type] * hours;

export function validateRental(i: { equipmentId: string; customer: string; hours: string }, rentals: readonly Rental[] = RENTALS): Record<string, string> {
  const e: Record<string, string> = {};
  const eq = EQUIPMENT.find((x) => x.id === i.equipmentId);
  if (!eq) e.equipmentId = 'Escolha o equipamento.';
  else if (equipmentStatus(eq, rentals) !== 'available') e.equipmentId = `Este equipamento está ${STATUS_LABEL[equipmentStatus(eq, rentals)].toLowerCase()}.`;
  if (i.customer.trim().length < 3 || i.customer.trim().length > 80) e.customer = 'Informe o nome do cliente (3 a 80 letras).';
  if (!/^\d$/.test(i.hours.trim()) || Number(i.hours) < 1 || Number(i.hours) > 8) e.hours = 'Informe de 1 a 8 horas.';
  return e;
}
/** Returning worse than it left needs a note; a bad condition sends the item to maintenance. */
export function validateReturn(i: { rentalId: string; condition: string; note: string }, rentals: readonly Rental[] = RENTALS): Record<string, string> {
  const e: Record<string, string> = {};
  const r = rentals.find((x) => x.id === i.rentalId && !x.returned);
  if (!r) { e.rentalId = 'Escolha um aluguel em andamento.'; return e; }
  if (!(i.condition in CONDITION_RANK)) e.condition = 'Informe o estado em que voltou.';
  else if (CONDITION_RANK[i.condition as Condition] > CONDITION_RANK[r.conditionOut] && i.note.trim().length < 5) e.note = 'O equipamento voltou pior: descreva o dano (mínimo 5 caracteres).';
  return e;
}
export const returnOutcome = (condition: Condition): 'maintenance' | 'available' => (condition === 'ruim' ? 'maintenance' : 'available');
export function validateMaintenance(i: { equipmentId: string; description: string }): Record<string, string> {
  const e: Record<string, string> = {};
  const eq = EQUIPMENT.find((x) => x.id === i.equipmentId);
  if (!eq || eq.retired) e.equipmentId = 'Escolha um equipamento em uso.';
  else if (activeRental(eq.id)) e.equipmentId = 'O equipamento está alugado: aguarde a devolução.';
  else if (MAINTENANCE.some((m) => m.equipmentId === eq.id && m.status === 'open')) e.equipmentId = 'Já existe uma manutenção aberta para este equipamento.';
  if (i.description.trim().length < 5) e.description = 'Descreva o problema (mínimo 5 caracteres).';
  return e;
}
export function validateEquipment(i: { code: string; type: string; unitId: string; condition: string }): Record<string, string> {
  const e: Record<string, string> = {};
  const code = i.code.trim().toUpperCase();
  if (!/^[A-Z]{2}-\d{2,3}$/.test(code)) e.code = 'Use duas letras, hífen e número (ex.: PR-05).';
  else if (EQUIPMENT.some((x) => x.code === code)) e.code = 'Já existe um equipamento com este código.';
  if (!(i.type in HOURLY_CENTS)) e.type = 'Escolha o tipo.';
  if (!UNITS.some((u) => u.active && u.id === i.unitId)) e.unitId = 'Escolha a unidade.';
  if (!(i.condition in CONDITION_RANK)) e.condition = 'Informe o estado.';
  return e;
}
export function equipmentHistory(equipmentId: string): { offset: number; text: string }[] {
  // `step` orders events within the same day: out, back, then maintenance opened.
  const rentals = RENTALS.filter((r) => r.equipmentId === equipmentId).flatMap((r) => [{ offset: r.dayOffset, step: 0, text: `Alugado a ${r.customer} por ${r.hours} h` }, ...(r.returned ? [{ offset: r.returned.dayOffset, step: 1, text: `Devolvido em estado ${CONDITION_LABEL[r.returned.condition].toLowerCase()}${r.returned.note ? ` (${r.returned.note})` : ''}` }] : [])]);
  const tickets = MAINTENANCE.filter((m) => m.equipmentId === equipmentId).map((m) => ({ offset: m.openedOffset, step: 2, text: `Manutenção ${m.status === 'open' ? 'aberta' : 'concluída'}: ${m.description}` }));
  return [...rentals, ...tickets].sort((a, b) => b.offset - a.offset || b.step - a.step).map(({ offset, text }) => ({ offset, text }));
}
