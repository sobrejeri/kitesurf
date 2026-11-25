'use server';

import { cookies } from 'next/headers';
import { CancelInput, FreeSlotsInput, PlaceOrderInput, friendlyOrderError } from '@/lib/public-store';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type PlaceResult = { ok: true; number: string; token: string } | { ok: false; error: string };

/** Envia só escolhas. Preço, desconto e comissão são calculados no banco. */
export async function placePublicOrder(input: unknown): Promise<PlaceResult> {
  const parsed = PlaceOrderInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Confira os dados do pedido.' };
  const v = parsed.data;
  // Link de afiliado (?ref=CODE) fica num cookie por 30 dias; o banco ignora código desconhecido ou suspenso.
  const ref = (await cookies()).get('vento_ref')?.value;
  const db = await createSupabaseServerClient('aluno');
  const { data, error } = await db.rpc('create_public_order', {
    p_slug: v.slug, p_customer: v.customer, p_phone: v.phone, p_items: v.items,
    p_affiliate_code: v.affiliate?.trim() || (ref && /^[A-Z0-9-]{3,32}$/.test(ref) ? ref : null), p_coupon_code: v.coupon?.trim() || null,
  });
  if (error) return { ok: false, error: friendlyOrderError(error.message) };
  const row = (data as { order_number: string; token: string }[] | null)?.[0];
  if (!row) return { ok: false, error: friendlyOrderError('') };
  return { ok: true, number: row.order_number, token: row.token };
}

export async function loadFreeSlots(input: unknown): Promise<string[]> {
  const parsed = FreeSlotsInput.safeParse(input);
  if (!parsed.success) return [];
  const v = parsed.data;
  const db = await createSupabaseServerClient('aluno');
  const { data } = await db.rpc('public_free_slots', { p_slug: v.slug, p_unit: v.unit, p_service: v.service, p_instructor: v.instructor, p_date: v.date });
  return (data as string[] | null) ?? [];
}

export type CancelResult = { ok: true } | { ok: false; error: string };
export async function cancelPublicOrder(input: unknown): Promise<CancelResult> {
  const parsed = CancelInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Diga o motivo (mínimo 3 letras).' };
  const db = await createSupabaseServerClient('aluno');
  const { error } = await db.rpc('cancel_public_order', { p_number: parsed.data.number, p_token: parsed.data.token, p_reason: parsed.data.reason });
  return error ? { ok: false, error: friendlyOrderError(error.message) } : { ok: true };
}
