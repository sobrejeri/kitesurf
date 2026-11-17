import 'server-only';

import { z } from 'zod';

import type { PublicOrder, StoreCatalog, PublicStoreListing, MyOrder } from '@/lib/public-store';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const Slug = z.string().regex(/^[a-z0-9-]{3,40}$/);

/** Leitura no servidor para as páginas. Falha vira null (a página mostra "não encontrado"). */
export async function readCatalog(slug: string): Promise<StoreCatalog | null> {
  if (!Slug.safeParse(slug).success) return null;
  const db = await createSupabaseServerClient('aluno');
  const { data, error } = await db.rpc('public_store_catalog', { p_slug: slug });
  return error ? null : (data as StoreCatalog);
}
export async function readOrder(number: string, token: string | null): Promise<PublicOrder | null> {
  const db = await createSupabaseServerClient('aluno');
  const { data, error } = await db.rpc('get_public_order', { p_number: number, p_token: token });
  return error ? null : (data as PublicOrder);
}

export async function readStoreList(): Promise<PublicStoreListing[]> {
  const db = await createSupabaseServerClient('aluno');
  const { data } = await db.rpc('public_store_list');
  return (data as PublicStoreListing[] | null) ?? [];
}
export async function readMyOrders(): Promise<MyOrder[]> {
  const db = await createSupabaseServerClient('aluno');
  const { data } = await db.rpc('my_orders');
  return (data as MyOrder[] | null) ?? [];
}
