'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const MISSING_PROFILE='O perfil completo da pousada ainda não está habilitado. Execute a migração 22 no Supabase.';

function readableError(error:{code?:string;message?:string}):string {
  if(['PGRST202','PGRST205','PGRST204','42P01','42883'].includes(error.code??''))
    return MISSING_PROFILE;
  if(/Approved establishment identity requires admin review/i.test(error.message??''))
    return 'Nome e praia só podem ser alterados pela administração após a aprovação. Os dados de contato continuam editáveis.';
  return friendlyError(error);
}
function refreshPartner() {
  revalidatePath('/pousada','layout');
  revalidatePath('/pousada/perfil');
  revalidatePath('/pousada/inicio');
  revalidatePath('/pousada/cadastro');
  revalidatePath('/admin/afiliados');
  revalidatePath('/admin/afiliados/[id]','page');
}

const Business=z.strictObject({
  name:z.string().trim().min(2).max(120),
  beachId:z.uuid(),
  responsibleName:z.string().trim().min(2).max(120),
  phone:z.string().trim().min(8).max(20).regex(/^[+0-9\s().-]+$/),
  city:z.string().trim().min(2).max(80),
  address:z.string().trim().min(5).max(200),
  instagram:z.string().trim().max(80),
});

export async function savePartnerProfile(_previous:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['partner']);
  if(viewer.role!=='partner')return {error:'Apenas a pousada pode alterar seu cadastro.'};
  const parsed=Business.safeParse({
    name:form.get('name'),beachId:form.get('beachId'),
    responsibleName:form.get('responsibleName'),phone:form.get('phone'),
    city:form.get('city'),address:form.get('address'),
    instagram:form.get('instagram')??'',
  });
  if(!parsed.success)return {error:'Informe nome, praia, responsável, telefone, cidade e endereço válidos.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('update_my_partner_profile',{
    p_name:parsed.data.name,p_beach_id:parsed.data.beachId,
    p_responsible_name:parsed.data.responsibleName,
    p_phone:parsed.data.phone,p_city:parsed.data.city,
    p_address:parsed.data.address,p_instagram:parsed.data.instagram,
  });
  if(error){
    console.error('[partner.profile.save]',{code:error.code,message:error.message});
    return {error:readableError(error)};
  }
  refreshPartner();
  return {ok:'Dados da pousada atualizados. O progresso será recalculado automaticamente.'};
}

const Payout=z.strictObject({
  method:z.enum(['pix','bank']),holderName:z.string().trim().min(2).max(120),
  pixKey:z.string().trim().max(140),bankName:z.string().trim().max(100),
  branch:z.string().trim().max(30),accountNumber:z.string().trim().max(40),
  accountType:z.enum(['checking','savings']),
});
export async function savePartnerPayout(_previous:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['partner']);
  if(viewer.role!=='partner')return {error:'Apenas a pousada pode cadastrar seu recebimento.'};
  const parsed=Payout.safeParse({
    method:form.get('method'),holderName:form.get('holderName'),
    pixKey:form.get('pixKey')??'',bankName:form.get('bankName')??'',
    branch:form.get('branch')??'',accountNumber:form.get('accountNumber')??'',
    accountType:form.get('accountType')??'checking',
  });
  if(!parsed.success)return {error:'Confira os dados para recebimento.'};
  const p=parsed.data;
  if(p.method==='pix' && p.pixKey.length<5)return {error:'Informe uma chave Pix válida.'};
  if(p.method==='bank' && (!p.bankName||!p.branch||!p.accountNumber))
    return {error:'Informe banco, agência e conta.'};
  const db=await createSupabaseServerClient();
  const check=await db.from('partner_payout_details').select('id').eq('id',viewer.id).maybeSingle();
  if(check.error)return {error:readableError(check.error)};
  const fields={
    method:p.method,holder_name:p.holderName,
    pix_key:p.method==='pix'?p.pixKey:null,
    bank_name:p.method==='bank'?p.bankName:null,
    branch:p.method==='bank'?p.branch:null,
    account_number:p.method==='bank'?p.accountNumber:null,
    account_type:p.method==='bank'?p.accountType:null,
    updated_at:new Date().toISOString(),
  };
  const save=check.data
    ?await db.from('partner_payout_details').update(fields).eq('id',viewer.id)
    :await db.from('partner_payout_details').insert({id:viewer.id,...fields});
  if(save.error){
    console.error('[partner.payout.save]',{code:save.error.code,message:save.error.message});
    return {error:readableError(save.error)};
  }
  refreshPartner();
  return {ok:'Dados de recebimento salvos com privacidade. Repasse automático ainda não está habilitado.'};
}

const AVATAR_MIMES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'} as const;
const AVATAR_BUCKET='vento-partner-avatars';
function validImage(bytes:Uint8Array,mime:keyof typeof AVATAR_MIMES):boolean {
  if(mime==='image/jpeg')return bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  if(mime==='image/png')return bytes.length>=8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  return bytes.length>=12 &&
    String.fromCharCode(...bytes.slice(0,4))==='RIFF' &&
    String.fromCharCode(...bytes.slice(8,12))==='WEBP';
}
export async function uploadPartnerAvatar(_previous:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['partner']);
  if(viewer.role!=='partner')return {error:'Apenas a pousada pode alterar sua foto.'};
  const file=form.get('avatar');
  if(!(file instanceof File)||file.size===0)return {error:'Selecione uma foto ou logo.'};
  if(file.size>3*1024*1024)return {error:'A imagem deve ter no máximo 3 MB.'};
  if(!(file.type in AVATAR_MIMES))return {error:'Envie JPG, PNG ou WebP.'};
  try {
    const mime=file.type as keyof typeof AVATAR_MIMES;
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!validImage(bytes,mime))return {error:'O arquivo não é uma imagem válida.'};
    const db=await createSupabaseServerClient();
    const path=viewer.id+'/avatar.'+AVATAR_MIMES[mime];
    const upload=await db.storage.from(AVATAR_BUCKET).upload(path,bytes,{
      contentType:mime,upsert:true,cacheControl:'60',
    });
    if(upload.error){
      console.error('[partner.avatar.storage]',{message:upload.error.message});
      return {error:'Não foi possível enviar a foto ao armazenamento privado do Supabase.'};
    }
    const save=await db.rpc('set_my_partner_avatar',{p_path:path});
    if(save.error){
      console.error('[partner.avatar.save]',{code:save.error.code,message:save.error.message});
      return {error:readableError(save.error)};
    }
    refreshPartner();
    return {ok:'Foto da pousada atualizada.'};
  }catch(error){
    console.error('[partner.avatar.unexpected]',error);
    return {error:'Não foi possível atualizar a foto. Tente novamente com JPG, PNG ou WebP de até 3 MB.'};
  }
}
