'use server';

import { z } from 'zod';

import { friendlyOrderError } from '@/lib/public-store';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const Slug = z.string().regex(/^[a-z0-9-]{3,40}$/);
const Item = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('lesson'), unit_id: z.uuid(), service_id: z.uuid(), instructor_id: z.uuid(), starts_at: z.string().max(40) }),
  z.strictObject({ kind: z.literal('product'), unit_id: z.uuid(), product_id: z.uuid(), qty: z.number().int().min(1).max(20) }),
  z.strictObject({ kind: z.literal('rental'), unit_id: z.uuid(), type: z.string().max(30), hours: z.number().int().min(1).max(12), qty: z.number().int().min(1).max(10) }),
]);
const PlaceOrder = z.strictObject({
  slug: Slug, customer: z.string().trim().min(3).max(80), phone: z.string().max(30),
  items: z.array(Item).min(1).max(10), affiliate: z.string().max(32).optional(), coupon: z.string().max(32).optional(),
});

export type PlaceResult = { ok: true; number: string; token: string } | { ok: false; error: string };

/** Envia só escolhas. Preço, desconto e comissão são calculados no banco. */
export async function placePublicOrder(input: unknown): Promise<PlaceResult> {
  const parsed = PlaceOrder.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Confira os dados do pedido.' };
  const v = parsed.data;
  const db = await createSupabaseServerClient('aluno');
  const { data, error } = await db.rpc('create_public_order', {
    p_slug: v.slug, p_customer: v.customer, p_phone: v.phone, p_items: v.items,
    p_affiliate_code: v.affiliate?.trim() || null, p_coupon_code: v.coupon?.trim() || null,
  });
  if (error) return { ok: false, error: friendlyOrderError(error.message) };
  const row = (data as { order_number: string; token: string }[] | null)?.[0];
  if (!row) return { ok: false, error: friendlyOrderError('') };
  return { ok: true, number: row.order_number, token: row.token };
}

export async function loadFreeSlots(input: unknown): Promise<string[]> {
  const parsed = z.strictObject({ slug: Slug, unit: z.uuid(), service: z.uuid(), instructor: z.uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(input);
  if (!parsed.success) return [];
  const v = parsed.data;
  const db = await createSupabaseServerClient('aluno');
  const { data } = await db.rpc('public_free_slots', { p_slug: v.slug, p_unit: v.unit, p_service: v.service, p_instructor: v.instructor, p_date: v.date });
  return (data as string[] | null) ?? [];
}

export type CancelResult = { ok: true } | { ok: false; error: string };
export async function cancelPublicOrder(input: unknown): Promise<CancelResult> {
  const parsed = z.strictObject({ number: z.string().max(40), token: z.string().max(80).nullable(), reason: z.string().trim().min(3).max(150) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Diga o motivo (mínimo 3 letras).' };
  const db = await createSupabaseServerClient('aluno');
  const { error } = await db.rpc('cancel_public_order', { p_number: parsed.data.number, p_token: parsed.data.token, p_reason: parsed.data.reason });
  return error ? { ok: false, error: friendlyOrderError(error.message) } : { ok: true };
}
