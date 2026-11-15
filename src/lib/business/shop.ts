import { COUPONS, EQUIPMENT, ORIGIN_LABEL, PRODUCTS, SHOP_ORDERS, UNITS, UNIT_SERVICES, type CartItem, type Coupon, type EquipmentType, type ShopOrder, type ShopOrderStatus, type StoreSettings } from './demo.ts';
import { availableSlots, currentContext, type BookingContext } from './bookings.ts';
import { effectivePriceCents, parseMoneyToCents, serviceOf } from './services.ts';
import { equipmentStatus, productStock, rentalPrice } from './stock.ts';

/**
 * The shop sells lessons, products and rentals. The cart keeps only choices;
 * every price and availability is recomputed here from the catalog. Nothing
 * is charged: an order is a request, paid directly with the school.
 */
const activeUnit = (id: string) => UNITS.some((u) => u.id === id && u.active);

export function itemUnitPriceCents(item: CartItem): number {
  if (item.kind === 'lesson') {
    const service = serviceOf(item.serviceId); const config = UNIT_SERVICES.find((c) => c.serviceId === item.serviceId && c.unitId === item.unitId);
    return service && config ? effectivePriceCents(service, config) : 0;
  }
  if (item.kind === 'product') return PRODUCTS.find((p) => p.id === item.productId)?.priceCents ?? 0;
  return rentalPrice(item.type, item.hours);
}
export const itemQuantity = (item: CartItem): number => (item.kind === 'lesson' ? item.people : item.qty);
export const lineCents = (item: CartItem): number => itemUnitPriceCents(item) * itemQuantity(item);
export const subtotalCents = (items: readonly CartItem[]): number => items.reduce((sum, i) => sum + lineCents(i), 0);

export function itemTitle(item: CartItem): string {
  if (item.kind === 'lesson') return serviceOf(item.serviceId)?.name ?? 'Aula';
  if (item.kind === 'product') return PRODUCTS.find((p) => p.id === item.productId)?.name ?? 'Produto';
  return `Aluguel de ${item.type}`;
}

/** Rental units free right now for a type in a unit (individually tracked equipment). */
export const rentalAvailable = (type: EquipmentType, unitId: string): number =>
  EQUIPMENT.filter((e) => e.type === type && e.unitId === unitId && equipmentStatus(e) === 'available').length;

const cartKey = (i: CartItem) => (i.kind === 'product' ? `p:${i.productId}:${i.unitId}` : i.kind === 'rental' ? `r:${i.type}:${i.unitId}` : '');

/** Checks one item against the catalog, counting what the cart already holds of the same thing. */
export function validateItem(item: CartItem, cart: readonly CartItem[] = [], ctx: BookingContext = currentContext()): string | null {
  if (!activeUnit(item.unitId)) return 'Escolha uma unidade ativa.';
  if (item.kind === 'lesson') {
    if (!Number.isInteger(item.people) || item.people < 1 || item.people > (serviceOf(item.serviceId)?.capacity ?? 0)) return 'Número de alunos acima da capacidade da aula.';
    if (!availableSlots({ unitId: item.unitId, serviceId: item.serviceId, instructorId: item.instructorId, dayOffset: item.dayOffset }, ctx).includes(item.start)) return 'Escolha um horário livre.';
    if (cart.some((c) => c.id !== item.id && c.kind === 'lesson' && c.instructorId === item.instructorId && c.dayOffset === item.dayOffset && c.start === item.start)) return 'Este horário já está no carrinho.';
    return null;
  }
  if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 20) return 'Quantidade de 1 a 20.';
  const already = cart.filter((c) => c.id !== item.id && cartKey(c) === cartKey(item)).reduce((n, c) => n + itemQuantity(c), 0);
  if (item.kind === 'product') {
    const stock = productStock(item.productId, item.unitId);
    return item.qty + already > stock ? `Só há ${stock} em estoque nesta unidade.` : null;
  }
  if (!Number.isInteger(item.hours) || item.hours < 1 || item.hours > 8) return 'Aluguel de 1 a 8 horas.';
  const free = rentalAvailable(item.type, item.unitId);
  return item.qty + already > free ? `Só há ${free} disponível(is) nesta unidade.` : null;
}

export interface CouponResult { ok: boolean; coupon?: Coupon; discountCents: number; error?: string }
const norm = (code: string) => code.trim().toUpperCase();
/** The discount applies only to items of the units the coupon covers; computed once, never above that part. */
export function applyCoupon(code: string, items: readonly CartItem[], coupons: readonly Coupon[] = COUPONS): CouponResult {
  const coupon = coupons.find((c) => c.code === norm(code));
  const fail = (error: string): CouponResult => ({ ok: false, discountCents: 0, error });
  if (!coupon) return fail('Cupom não encontrado.');
  if (!coupon.active) return fail('Este cupom está pausado.');
  if (coupon.untilOffset < 0) return fail('Este cupom venceu.');
  if (coupon.used >= coupon.maxUses) return fail('Este cupom atingiu o limite de usos.');
  const eligible = items.filter((i) => coupon.unitIds.length === 0 || coupon.unitIds.includes(i.unitId));
  if (eligible.length === 0) return fail('Este cupom não vale para as unidades do carrinho.');
  const base = subtotalCents(eligible);
  if (base < coupon.minCents) return fail('O carrinho não atingiu o valor mínimo do cupom.');
  const raw = coupon.kind === 'percent' ? Math.floor((base * coupon.value) / 10000) : coupon.value;
  return { ok: true, coupon, discountCents: Math.min(raw, base) };
}

export interface UnitOrder { unitId: string; items: CartItem[]; subtotalCents: number; discountCents: number; totalCents: number }
/** One operational order per unit. The discount is shared in proportion; the last unit takes the remainder, so the parts always add up. */
export function splitByUnit(items: readonly CartItem[], coupon?: Coupon, discountCents = 0): UnitOrder[] {
  const unitIds = [...new Set(items.map((i) => i.unitId))];
  const eligibleIds = unitIds.filter((u) => !coupon || coupon.unitIds.length === 0 || coupon.unitIds.includes(u));
  const eligibleTotal = eligibleIds.reduce((n, u) => n + subtotalCents(items.filter((i) => i.unitId === u)), 0);
  let left = discountCents;
  return unitIds.map((unitId) => {
    const mine = items.filter((i) => i.unitId === unitId); const sub = subtotalCents(mine);
    const isLast = unitId === eligibleIds[eligibleIds.length - 1];
    const share = !eligibleIds.includes(unitId) || eligibleTotal === 0 ? 0 : isLast ? left : Math.floor((discountCents * sub) / eligibleTotal);
    left -= share;
    return { unitId, items: mine, subtotalCents: sub, discountCents: share, totalCents: sub - share };
  });
}

export function orderTotals(order: ShopOrder): { subtotalCents: number; discountCents: number; totalCents: number; units: UnitOrder[] } {
  const subtotal = subtotalCents(order.items);
  const coupon = order.couponCode ? COUPONS.find((c) => c.code === order.couponCode) : undefined;
  const eligible = coupon ? order.items.filter((i) => coupon.unitIds.length === 0 || coupon.unitIds.includes(i.unitId)) : [];
  const base = subtotalCents(eligible);
  const discount = coupon ? Math.min(coupon.kind === 'percent' ? Math.floor((base * coupon.value) / 10000) : coupon.value, base) : 0;
  return { subtotalCents: subtotal, discountCents: discount, totalCents: subtotal - discount, units: splitByUnit(order.items, coupon, discount) };
}

export const ORDER_STATUS_LABEL: Record<ShopOrderStatus, string> = { received: 'Recebido', confirmed: 'Confirmado', ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado' };
export const orderById = (id: string): ShopOrder | undefined => SHOP_ORDERS.find((o) => o.id === id);
export const ordersInScope = (unitIds: ReadonlySet<string>): ShopOrder[] => SHOP_ORDERS.filter((o) => o.items.some((i) => unitIds.has(i.unitId)));
export const originTotals = (orders: readonly ShopOrder[]): { origin: string; orders: number; cents: number }[] => {
  const map = new Map<string, { origin: string; orders: number; cents: number }>();
  for (const o of orders.filter((x) => x.status !== 'cancelled')) {
    const label = ORIGIN_LABEL[o.origin]; const row = map.get(label) ?? { origin: label, orders: 0, cents: 0 };
    row.orders += 1; row.cents += orderTotals(o).totalCents; map.set(label, row);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
};

const digits = (t: string) => t.replace(/\D/g, '');
export function validateCustomer(i: { name: string; phone: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.name.trim().length < 3 || i.name.trim().length > 80) e.name = 'Informe seu nome (3 a 80 letras).';
  if (digits(i.phone).length < 10 || digits(i.phone).length > 13) e.phone = 'Informe um telefone com DDD.';
  return e;
}
export function validateStore(i: { name: string; slogan: string; whatsapp: string; accent: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.name.trim().length < 3 || i.name.trim().length > 60) e.name = 'Nome da loja de 3 a 60 letras.';
  if (i.slogan.trim().length > 90) e.slogan = 'A frase pode ter até 90 caracteres.';
  if (digits(i.whatsapp).length < 10 || digits(i.whatsapp).length > 13) e.whatsapp = 'Informe o WhatsApp com DDD.';
  if (!['azul', 'preto', 'cinza'].includes(i.accent)) e.accent = 'Escolha uma das cores.';
  return e;
}
export function validateCoupon(i: { code: string; kind: string; value: string; min: string; days: string; maxUses: string }, existing: readonly Coupon[] = COUPONS): Record<string, string> {
  const e: Record<string, string> = {};
  if (!/^[A-Z0-9]{4,16}$/.test(norm(i.code))) e.code = 'Código de 4 a 16 letras ou números, sem espaços.';
  else if (existing.some((c) => c.code === norm(i.code))) e.code = 'Já existe um cupom com este código.';
  if (i.kind !== 'percent' && i.kind !== 'fixed') e.kind = 'Escolha percentual ou valor fixo.';
  else if (i.kind === 'percent') { const p = Number(i.value); if (!Number.isInteger(p) || p < 1 || p > 50) e.value = 'Percentual de 1 a 50.'; }
  else { const c = parseMoneyToCents(i.value); if (c === null || c < 100 || c > 100000) e.value = 'Valor de R$ 1,00 a R$ 1.000,00.'; }
  if (i.min.trim() !== '' && parseMoneyToCents(i.min) === null) e.min = 'Valor mínimo em reais, com até 2 casas.';
  const days = Number(i.days); if (!Number.isInteger(days) || days < 1 || days > 365) e.days = 'Validade de 1 a 365 dias.';
  const uses = Number(i.maxUses); if (!Number.isInteger(uses) || uses < 1 || uses > 10000) e.maxUses = 'Limite de 1 a 10000 usos.';
  return e;
}
export const ACCENT: Record<StoreSettings['accent'], { label: string; bg: string; fg: string }> = {
  azul: { label: 'Azul', bg: '#1d4ed8', fg: '#ffffff' }, preto: { label: 'Preto', bg: '#111827', fg: '#ffffff' }, cinza: { label: 'Cinza', bg: '#6b7280', fg: '#ffffff' },
};
export const couponLabel = (c: Coupon): string => (c.kind === 'percent' ? `${c.value / 100}%` : `R$ ${Math.floor(c.value / 100)},${String(c.value % 100).padStart(2, '0')}`);
