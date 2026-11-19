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
export const brl = (cents: number): string => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const minutesLabel = (m: number): string => (m % 60 === 0 ? `${m / 60}h` : m > 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`);
export const RENTAL_LABEL: Record<string, string> = { prancha: 'Prancha', pipa: 'Pipa (kite)', trapezio: 'Trapézio', colete: 'Colete', capacete: 'Capacete' };
export const rentalName = (type: string): string => RENTAL_LABEL[type] ?? type;
export const STATUS_LABEL: Record<string, string> = {
  received: 'Recebido, aguardando a escola', confirmed: 'Confirmado pela escola', preparing: 'Em preparo', ready: 'Pronto', delivered: 'Entregue', completed: 'Concluído', cancelled: 'Cancelado',
};
export const statusLabel = (s: string): string => STATUS_LABEL[s] ?? s;

/** Mensagens do banco em português; o que não conhecemos vira um texto genérico (nunca o erro cru). */
export function friendlyOrderError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('too many requests')) return 'Muitos pedidos por esse número agora. Tente de novo mais tarde ou chame a escola no WhatsApp.';
  if (m.includes('invalid phone')) return 'Informe o WhatsApp com DDD (10 a 13 números).';
  if (m.includes('invalid name')) return 'Informe seu nome (3 a 80 letras).';
  if (m.includes('store not available')) return 'Esta loja não está disponível agora.';
  if (m.includes('coupon') && m.includes('sign in')) return 'Para usar cupom, entre na sua conta com e-mail confirmado.';
  if (m.includes('not allowed for this account')) return 'Esta conta não pode fazer pedidos.';
  if (m.includes('order not found')) return 'Pedido não encontrado. Confira o link que você recebeu.';
  if (m.includes('already started')) return 'A escola já começou este pedido. Fale com a escola.';
  if (m.includes('items')) return 'O pedido precisa de 1 a 10 itens.';
  if (m.includes('slot') || m.includes('instructor') || m.includes('busy') || m.includes('available')) return 'Esse horário ou item não está mais disponível. Escolha outro.';
  return 'Não foi possível concluir agora. Confira os dados e tente de novo.';
}
