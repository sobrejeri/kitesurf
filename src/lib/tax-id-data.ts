import 'server-only';

import { createSupabaseServerClient } from './supabase/server';
import type { TaxIdKind } from './tax-id';

/**
 * The CPF or CNPJ of one account, as its holder or the administration may
 * read it (row level security in migration 47). "unavailable" means the
 * migration is not applied yet: the pages keep working without the field.
 */
export type TaxIdState =
  | { status: 'unavailable' }
  | { status: 'missing'; locked: boolean }
  | { status: 'saved'; kind: TaxIdKind; number: string; locked: boolean };

export async function getTaxIdState(profileId: string, approved: boolean): Promise<TaxIdState> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from('account_tax_ids').select('kind, number')
    .eq('id', profileId).maybeSingle<{ kind: TaxIdKind; number: string }>();
  if (error) {
    console.warn('[tax-id] Unavailable', { code: error.code });
    return { status: 'unavailable' };
  }
  // An account approved before the field existed may still add it once.
  if (!data) return { status: 'missing', locked: false };
  return { status: 'saved', kind: data.kind, number: data.number, locked: approved };
}

/** Presence flag for the completion lists; undefined while unavailable. */
export function taxIdFlag(state: TaxIdState): boolean | undefined {
  return state.status === 'unavailable' ? undefined : state.status === 'saved';
}
