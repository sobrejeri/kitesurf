'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const MAX_SIZE=8*1024*1024;
const MIMES={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'} as const;
type Mime=keyof typeof MIMES;

function validSignature(bytes:Uint8Array,mime:Mime) {
  if(mime==='application/pdf')return bytes.length>5&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
  if(mime==='image/jpeg')return bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  return bytes.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
}

export async function uploadInstructorDocument(_prev:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['instructor']);
  if(viewer.role!=='instructor')return {error:'Somente instrutores podem enviar esses documentos.'};
  const kind=z.enum(['identity','certification','insurance','other']).safeParse(form.get('kind'));
  const file=form.get('document');
  if(!kind.success||!(file instanceof File)||file.size===0)return {error:'Selecione o tipo e o arquivo.'};
  if(file.size>MAX_SIZE)return {error:'O arquivo precisa ter no máximo 8 MB.'};
  if(!(file.type in MIMES))return {error:'Formatos permitidos: PDF, JPG ou PNG.'};
  try {
    const mime=file.type as Mime;
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!validSignature(bytes,mime))return {error:'Formato do arquivo não corresponde ao conteúdo.'};
    const path=viewer.id+'/'+crypto.randomUUID()+'.'+MIMES[mime];
    const db=await createSupabaseServerClient();
    const {error:uploadError}=await db.storage.from('vento-instructor-documents').upload(path,bytes,{
      upsert:false,contentType:mime,cacheControl:'60',
    });
    if(uploadError) {
      console.error('[document.upload]',{message:uploadError.message});
      return {error:'Não foi possível enviar o arquivo. Verifique o armazenamento privado.'};
    }
    const {error:recordError}=await db.rpc('register_my_document',{
      p_kind:kind.data,p_path:path,p_original_name:(file.name.slice(0,180)||'documento'),
    });
    if(recordError) {
      console.error('[document.register]',{code:recordError.code,message:recordError.message});
      return {error:friendlyError(recordError)};
    }
    revalidatePath('/instrutor/documentos');revalidatePath('/admin/documentos');
    return {ok:'Documento enviado para análise da administração.'};
  } catch(error) {
    console.error('[document.unexpected]',error);
    return {error:'Falha no envio do documento. Tente novamente.'};
  }
}

export async function reviewInstructorDocument(_prev:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['admin']);
  if(viewer.role!=='admin')return {error:'Apenas a administração pode analisar documentos.'};
  const parsed=z.strictObject({
    id:z.uuid(),status:z.enum(['approved','rejected']),notes:z.string().trim().max(1000),
  }).safeParse({id:form.get('id'),status:form.get('status'),notes:form.get('notes')??''});
  if(!parsed.success || (parsed.data.status==='rejected'&&parsed.data.notes.length<5))
    return {error:'Selecione a decisão e informe um motivo para rejeitar.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('review_instructor_document',{
    p_document_id:parsed.data.id,p_status:parsed.data.status,p_notes:parsed.data.notes,
  });
  if(error)return {error:friendlyError(error)};
  revalidatePath('/instrutor/documentos');revalidatePath('/admin/documentos');
  revalidatePath('/admin/instrutores/[id]','page');
  return {ok:'Análise do documento registrada. Atualize o cadastro do instrutor para conferir a liberação.'};
}
