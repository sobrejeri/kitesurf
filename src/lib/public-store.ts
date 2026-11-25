import { z } from 'zod';

/**
 * Vitrine pública das escolas do Business. O navegador só envia ESCOLHAS
 * (unidade, serviço, instrutor, horário, quantidade); todo preço é calculado
 * pelo banco em create_public_order. Os valores exibidos aqui vêm do catálogo
 * e servem apenas para mostrar, nunca são enviados de volta.
 */
export interface StoreUnit { id: string; name: string; city: string; address: string | null; opens: string; closes: string }
export interface ServiceUnit { unit_id: string; price_cents: number; place: string | null; weekdays: number[] | null; instructors: { id: string; first_name: string }[] }
export interface StoreService { id: string; name: string; minutes: number; capacity: number | null; description: string | null; units: ServiceUnit[] }
export interface StoreProduct { id: string; name: string; category: string | null; price_cents: number; units: { unit_id: string; available: boolean }[] }
export interface StoreRental { type: string; cents_per_hour: number; units: { unit_id: string; available: number }[] }
export interface StoreCatalog {
  store: { name: string; slogan: string | null; whatsapp: string | null; accent: string | null; slug: string };
  units: StoreUnit[]; services: StoreService[]; products: StoreProduct[]; rentals: StoreRental[];
}
export interface PublicStoreListing { slug: string; name: string; slogan: string | null; accent: string | null; cities: string[] }
export interface PublicOrder {
  number: string; status: string; created_at: string; subtotal_cents: number; discount_cents: number; total_cents: number; cancellable: boolean;
  store: { name: string; whatsapp: string | null };
  items: { kind: 'lesson' | 'product' | 'rental'; qty: number; starts_at: string | null; hours: number | null; line_cents: number; discount_cents: number; unit: string; name: string }[];
}
export interface MyOrder { number: string; store_name: string; status: string; total_cents: number; created_at: string; cancellable: boolean }

/** Escolhas do carrinho. Nenhum valor monetário. */
export type CartLine =
  | { key: string; kind: 'lesson'; unit_id: string; service_id: string; instructor_id: string; starts_at: string; label: string }
  | { key: string; kind: 'product'; unit_id: string; product_id: string; qty: number; label: string }
  | { key: string; kind: 'rental'; unit_id: string; type: string; hours: number; qty: number; label: string };

export const MAX_CART_ITEMS = 10;
/** Limites iguais aos do banco (company_place_order): quantidade 1 a 20 e aluguel de 1 a 8 horas. */
export const MAX_QTY = 20;
export const RENTAL_MAX_HOURS = 8;
export const RENTAL_HOUR_OPTIONS = [1, 2, 3, 4, 6, 8] as const;

const Label = z.string().min(1).max(200);
const Key = z.string().min(1).max(200);
const CartLineSchema = z.discriminatedUnion('kind', [
  z.strictObject({ key: Key, kind: z.literal('lesson'), unit_id: z.uuid(), service_id: z.uuid(), instructor_id: z.uuid(), starts_at: z.string().max(40), label: Label }),
  z.strictObject({ key: Key, kind: z.literal('product'), unit_id: z.uuid(), product_id: z.uuid(), qty: z.number().int().min(1).max(MAX_QTY), label: Label }),
  z.strictObject({ key: Key, kind: z.literal('rental'), unit_id: z.uuid(), type: z.string().min(1).max(30), hours: z.number().int().min(1).max(RENTAL_MAX_HOURS), qty: z.number().int().min(1).max(MAX_QTY), label: Label }),
]);

/**
 * O carrinho volta do sessionStorage, que o usuário pode alterar. Só linhas válidas (e só escolhas, nunca
 * valores) sobrevivem; o resto é descartado e o total nunca passa de MAX_CART_ITEMS. O banco revalida tudo.
 */
export function sanitizeCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CartLine[] = [];
  for (const item of raw) {
    const parsed = CartLineSchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.key)) continue;
    seen.add(parsed.data.key);
    out.push(parsed.data as CartLine);
    if (out.length >= MAX_CART_ITEMS) break;
  }
  return out;
}

/** Troca a quantidade de uma linha de produto ou aluguel, dentro de 1 a MAX_QTY. Aulas não têm quantidade. */
export function setLineQty(cart: CartLine[], key: string, qty: number): CartLine[] {
  const next = Math.min(MAX_QTY, Math.max(1, Math.trunc(qty)));
  return cart.map((l) => (l.key === key && l.kind !== 'lesson' ? { ...l, qty: next } : l));
}
export const brl = (cents: number): string => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const minutesLabel = (m: number): string => (m % 60 === 0 ? `${m / 60}h` : m > 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`);
export const RENTAL_LABEL: Record<string, string> = { prancha: 'Prancha', pipa: 'Pipa (kite)', trapezio: 'Trapézio', colete: 'Colete', capacete: 'Capacete' };
export const rentalName = (type: string): string => RENTAL_LABEL[type] ?? type;
export const STATUS_LABEL: Record<string, string> = {
  received: 'Recebido, aguardando a escola', confirmed: 'Confirmado pela escola', preparing: 'Em preparo', ready: 'Pronto', delivered: 'Entregue', completed: 'Concluído', cancelled: 'Cancelado',
};
export const statusLabel = (s: string): string => STATUS_LABEL[s] ?? s;

/**
 * Entrada das ações de servidor. strictObject: qualquer campo a mais (preço, total, desconto, comissão) é recusado;
 * o cliente só envia escolhas e o banco calcula todo valor.
 */
const Slug = z.string().regex(/^[a-z0-9-]{3,40}$/);
const OrderItem = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('lesson'), unit_id: z.uuid(), service_id: z.uuid(), instructor_id: z.uuid(), starts_at: z.string().max(40) }),
  z.strictObject({ kind: z.literal('product'), unit_id: z.uuid(), product_id: z.uuid(), qty: z.number().int().min(1).max(MAX_QTY) }),
  z.strictObject({ kind: z.literal('rental'), unit_id: z.uuid(), type: z.string().max(30), hours: z.number().int().min(1).max(RENTAL_MAX_HOURS), qty: z.number().int().min(1).max(MAX_QTY) }),
]);
export const PlaceOrderInput = z.strictObject({
  slug: Slug, customer: z.string().trim().min(3).max(80), phone: z.string().max(30),
  items: z.array(OrderItem).min(1).max(MAX_CART_ITEMS), affiliate: z.string().max(32).optional(), coupon: z.string().max(32).optional(),
});
export const FreeSlotsInput = z.strictObject({ slug: Slug, unit: z.uuid(), service: z.uuid(), instructor: z.uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export const CancelInput = z.strictObject({ number: z.string().max(40), token: z.string().max(80).nullable(), reason: z.string().trim().min(3).max(150) });

/** Mensagens do banco em português; o que não conhecemos vira um texto genérico (nunca o erro cru). */
export function friendlyOrderError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('too many requests')) return 'Muitos pedidos por esse número agora. Tente de novo mais tarde ou chame a escola no WhatsApp.';
  if (m.includes('invalid phone')) return 'Informe o WhatsApp com DDD (10 a 13 números).';
  if (m.includes('invalid name')) return 'Informe seu nome (3 a 80 letras).';
  if (m.includes('store not available') || m.includes('company not available')) return 'Esta loja não está disponível agora.';
  if (m.includes('coupon') && m.includes('sign in')) return 'Para usar cupom, entre na sua conta com e-mail confirmado.';
  if (m.includes('coupon not found')) return 'Cupom não encontrado nesta escola. Confira o código.';
  if (m.includes('coupon expired')) return 'Este cupom venceu.';
  if (m.includes('coupon is paused')) return 'Este cupom está pausado pela escola.';
  if (m.includes('coupon reached')) return 'Este cupom já chegou ao limite de usos.';
  if (m.includes('coupon minimum')) return 'O pedido ainda não chega ao valor mínimo do cupom.';
  if (m.includes('coupon does not cover')) return 'Este cupom não vale para as unidades do pedido.';
  if (m.includes('sign in required')) return 'Entre na sua conta para continuar.';
  if (m.includes('not allowed for this account')) return 'Esta conta não pode fazer pedidos.';
  if (m.includes('order not found')) return 'Pedido não encontrado. Confira o link que você recebeu.';
  if (m.includes('already started')) return 'A escola já começou este pedido. Fale com a escola.';
  if (m.includes('say why')) return 'Diga o motivo (mínimo 3 letras).';
  if (m.includes('not enough stock')) return 'Estoque insuficiente nessa unidade. Reduza a quantidade ou escolha outra unidade.';
  if (m.includes('not enough equipment')) return 'Sem equipamento livre nessa unidade agora. Escolha outra unidade.';
  if (m.includes('rental of') || m.includes('quantity from')) return `Confira as horas (1 a ${RENTAL_MAX_HOURS}) e a quantidade (1 a ${MAX_QTY}).`;
  if (m.includes('no price in force') || m.includes('no rental rate')) return 'Este item está sem preço no momento. Fale com a escola.';
  if (m.includes('same lesson time')) return 'Há duas aulas no mesmo horário. Mantenha só uma.';
  if (m.includes('items')) return `O pedido precisa de 1 a ${MAX_CART_ITEMS} itens.`;
  if (m.includes('slot') || m.includes('instructor') || m.includes('busy') || m.includes('available') || m.includes('future time') || m.includes('service hours')
    || m.includes('capacity') || m.includes('not enabled')) return 'Esse horário ou item não está mais disponível. Escolha outro.';
  return 'Não foi possível concluir agora. Confira os dados e tente de novo.';
}
