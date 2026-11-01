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

type UploadPreparation =
  | { error: string; path?: never; token?: never }
  | { path: string; token: string; error?: never };

/**
 * Small server action. Files go from the device directly to private Supabase
 * Storage with a single-use signed token; no multipart file travels through
 * the Render/Next Server Actions payload.
 */
export async function prepareInstructorDocumentUpload(input:{
  kind:string; name:string; mime:string; size:number;
}):Promise<UploadPreparation> {
  const viewer=await requireRole(['instructor']);
  if(viewer.role!=='instructor')return {error:'Somente instrutores podem enviar documentos.'};
  const parsed=z.strictObject({
    kind:z.enum(['identity','certification','insurance','other']),
    name:z.string().trim().min(1).max(180),
    mime:z.enum(['application/pdf','image/jpeg','image/png']),
    size:z.number().int().min(1).max(MAX_SIZE),
  }).safeParse(input);
  if(!parsed.success)return {error:'Confira o tipo, o arquivo e o limite de 8 MB (PDF, JPG ou PNG).'};
  const path=viewer.id+'/'+crypto.randomUUID()+'.'+MIMES[parsed.data.mime];
  try {
    const db=await createSupabaseServerClient();
    const {data,error}=await db.storage.from('vento-instructor-documents')
      .createSignedUploadUrl(path);
    if(error||!data?.token){
      console.error('[document.prepare]',{message:error?.message});
      return {error:'Não foi possível autorizar o envio. Confira o armazenamento privado do Supabase.'};
    }
    return {path,token:data.token};
  } catch(error) {
    console.error('[document.prepare.unexpected]',error);
    return {error:'Não foi possível iniciar o envio. Tente novamente.'};
  }
}

/**
 * Finalise only files in the current instructor's private folder. A signed
 * token is NOT sufficient to register an unverified or oversized file.
 * Read the uploaded bytes on the server to validate their real signature,
 * then use the existing role-checked, audited database RPC.
 */
export async function registerInstructorDocumentUpload(input:{
  kind:string; path:string; name:string;
}):Promise<ActionState> {
  const viewer=await requireRole(['instructor']);
  if(viewer.role!=='instructor')return {error:'Somente instrutores podem registrar documentos.'};
  const parsed=z.strictObject({
    kind:z.enum(['identity','certification','insurance','other']),
    path:z.string().max(120),
    name:z.string().trim().min(1).max(180),
  }).safeParse(input);
  if(!parsed.success)return {error:'Dados do documento inválidos. Escolha o arquivo novamente.'};
  const path=parsed.data.path;
  const pattern=new RegExp('^'+viewer.id+'/[0-9a-f-]{36}\\.(pdf|jpg|png)
  if(!pattern.test(path))return {error:'O documento não pertence a esta conta.'};
  const extension=path.split('.').pop();
  const mime=extension==='pdf'?'application/pdf':extension==='jpg'?'image/jpeg':'image/png';
  try {
    const db=await createSupabaseServerClient();
    const bucket=db.storage.from('vento-instructor-documents');
    const {data:blob,error:downloadError}=await bucket.download(path);
    if(downloadError||!blob) {
      console.error('[document.verify.download]',{message:downloadError?.message});
      return {error:'Arquivo ainda não disponível no armazenamento. Tente enviar novamente.'};
    }
    if(blob.size===0||blob.size>MAX_SIZE)
      return {error:'Arquivo vazio ou acima do limite de 8 MB.'};
    const data=new Uint8Array(await blob.arrayBuffer());
    if(!validSignature(data,mime as Mime))
      return {error:'O conteúdo não é um PDF, JPG ou PNG válido. Selecione outro arquivo.'};

    const {error}=await db.rpc('register_my_document',{
      p_kind:parsed.data.kind,p_path:path,p_original_name:parsed.data.name,
    });
    if(error){
      console.error('[document.register]',{code:error.code,message:error.message});
      return {error:friendlyError(error)};
    }
    revalidatePath('/instrutor/documentos');
    revalidatePath('/instrutor/cadastro');
    revalidatePath('/admin/documentos');
    revalidatePath('/admin/instrutores/[id]','page');
    return {ok:'Documento recebido! Agora aguarde a análise da administração.'};
  } catch(error) {
    console.error('[document.register.unexpected]',error);
    return {error:'O arquivo foi enviado, mas não conseguimos concluir o registro. Entre novamente e tente outra vez.'};
  }
}

);
  if(!pattern.test(path))return {error:'O documento não pertence a esta conta.'};
  const extension=path.split('.').pop();
  const mime=extension==='pdf'?'application/pdf':extension==='jpg'?'image/jpeg':'image/png';
  try {
    const db=await createSupabaseServerClient();
    const bucket=db.storage.from('vento-instructor-documents');
    const {data:blob,error:downloadError}=await bucket.download(path);
    if(downloadError||!blob) {
      console.error('[document.verify.download]',{message:downloadError?.message});
      return {error:'Arquivo ainda não disponível no armazenamento. Tente enviar novamente.'};
    }
    if(blob.size===0||blob.size>MAX_SIZE)
      return {error:'Arquivo vazio ou acima do limite de 8 MB.'};
    const data=new Uint8Array(await blob.arrayBuffer());
    if(!validSignature(data,mime as Mime))
      return {error:'O conteúdo não é um PDF, JPG ou PNG válido. Selecione outro arquivo.'};

    const {error}=await db.rpc('register_my_document',{
      p_kind:parsed.data.kind,p_path:path,p_original_name:parsed.data.name,
    });
    if(error){
      console.error('[document.register]',{code:error.code,message:error.message});
      return {error:friendlyError(error)};
    }
    revalidatePath('/instrutor/documentos');
    revalidatePath('/instrutor/cadastro');
    revalidatePath('/admin/documentos');
    revalidatePath('/admin/instrutores/[id]','page');
    return {ok:'Documento recebido! Agora aguarde a análise da administração.'};
  } catch(error) {
    console.error('[document.register.unexpected]',error);
    return {error:'O arquivo foi enviado, mas não conseguimos concluir o registro. Entre novamente e tente outra vez.'};
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
