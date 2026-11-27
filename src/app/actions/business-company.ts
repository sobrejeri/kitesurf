'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getViewer } from '@/lib/auth';
import { businessCoreEnabled } from '@/lib/business/core-feature';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isValidTaxId, normalizeTaxId } from '@/lib/tax-id';
import type { ActionState } from './errors';

const UNAVAILABLE='O cadastro de empresas está temporariamente indisponível. Tente novamente mais tarde.';
const Input=z.strictObject({
  legalName:z.string().trim().min(5).max(120),tradeName:z.string().trim().min(3).max(60),
  cnpj:z.string().max(30).transform(normalizeTaxId).refine(value=>value.length===14 && isValidTaxId(value)),
});
const fields=new Set(['legalName','tradeName','cnpj']);

/** create_company derives owner from Auth. This form persists exactly these
 * three fields; accepting contacts/terms/owner/status would imply false success.
 */
export async function createBusinessCompany(_previous:ActionState,form:FormData):Promise<ActionState> {
  if(!businessCoreEnabled())return {error:UNAVAILABLE};
  try {
  const viewer=await getViewer();
  if(!viewer)return {error:'Entre novamente para cadastrar sua empresa.'};
  if(!['student','instructor','partner'].includes(viewer.role))return {error:'O cadastro deve ser feito pelo responsável pela empresa.'};
  for(const key of form.keys())if(!fields.has(key) && !key.startsWith('$ACTION_')) {
    return {error:'Este cadastro salva somente razão social, nome fantasia e CNPJ. Os demais dados não foram enviados.'};
  }
  for(const key of fields)if(form.getAll(key).length!==1)return {error:'Confira os três campos do cadastro.'};
  const parsed=Input.safeParse(Object.fromEntries([...fields].map(key=>[key,form.get(key)])));
  if(!parsed.success)return {error:'Confira razão social, nome fantasia e CNPJ válidos.'};
    const db=await createSupabaseServerClient();
    const result=await db.rpc('create_company',{p_legal_name:parsed.data.legalName,p_trade_name:parsed.data.tradeName,p_cnpj:parsed.data.cnpj});
    if(result.error)return {error:result.error.code==='23505'?'Já existe um cadastro com este CNPJ. Confira suas empresas.':UNAVAILABLE};
    if(!z.uuid().safeParse(result.data).success)return {error:'O envio não foi confirmado. Consulte suas empresas antes de tentar novamente.'};
    const persisted=await db.from('companies').select('id,owner_id,legal_name,trade_name,cnpj,status')
      .eq('id',result.data).eq('owner_id',viewer.id).maybeSingle();
    const row=persisted.data;
    if(persisted.error || !row || row.id!==result.data || row.owner_id!==viewer.id
      || row.legal_name!==parsed.data.legalName || row.trade_name!==parsed.data.tradeName || row.cnpj!==parsed.data.cnpj) {
      return {error:'O envio não foi confirmado. Consulte suas empresas antes de tentar novamente.'};
    }
    for(const path of ['/aluno/empresa','/instrutor/empresa','/afiliado/empresa','/admin/empresas'])revalidatePath(path);
    return {ok:'Empresa cadastrada. Acompanhe a análise na lista de empresas.'};
  } catch { return {error:'O envio não foi confirmado. Consulte suas empresas antes de tentar novamente.'}; }
}
