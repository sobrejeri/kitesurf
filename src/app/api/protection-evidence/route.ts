import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { protectionStage3Enabled } from '@/lib/protection-stage3';

export const runtime='nodejs';

const ALLOWED=new Set(['application/pdf','image/png','image/jpeg','image/webp']);
const LIMIT=5*1024*1024;
function correctSignature(bytes:Uint8Array, mime:string):boolean {
  if(mime==='application/pdf')return [37,80,68,70,45].every((n,i)=>bytes[i]===n);
  if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(mime==='image/webp')return [82,73,70,70].every((n,i)=>bytes[i]===n)
    &&[87,69,66,80].every((n,i)=>bytes[8+i]===n);
  return false;
}

export async function POST(request:Request) {
  if(!protectionStage3Enabled())return NextResponse.json({error:'Envio de provas ainda não habilitado.'},{status:503});
  // Explicit same-origin check guards a cookie-authenticated multipart route.
  const origin=request.headers.get('origin');
  const host=request.headers.get('host');
  try{
    if(!origin||!host||new URL(origin).host!==host)throw Error('Invalid origin');
  }catch{return NextResponse.json({error:'Origem inválida.'},{status:403});}
  const area=new URL(request.url).searchParams.get('area');
  if(area!=='aluno'&&area!=='instrutor')
    return NextResponse.json({error:'Área inválida.'},{status:403});
  const length=Number(request.headers.get('content-length'));
  if(Number.isFinite(length)&&length>LIMIT+64*1024)
    return NextResponse.json({error:'Arquivo acima do limite de 5 MB.'},{status:413});

  const db=await createSupabaseServerClient(area);
  const {data:claims,error:claimsError}=await db.auth.getClaims();
  if(claimsError||!claims?.claims?.sub)
    return NextResponse.json({error:'Faça login novamente.'},{status:401});
  let form:FormData;
  try{form=await request.formData();}
  catch{return NextResponse.json({error:'Formulário inválido.'},{status:400});}
  const file=form.get('file'),statementId=form.get('statementId');
  if(!(file instanceof File)||file.size<1||file.size>LIMIT||!ALLOWED.has(file.type)
    ||typeof statementId!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(statementId)) {
    return NextResponse.json({error:'Selecione um PDF ou imagem de até 5 MB.'},{status:400});
  }
  const signature=new Uint8Array(await file.slice(0,16).arrayBuffer());
  if(!correctSignature(signature,file.type))
    return NextResponse.json({error:'O conteúdo do arquivo não corresponde ao formato informado.'},{status:400});
  const {data:prep,error:prepError}=await db.rpc('prepare_lesson_protection_evidence',{
    p_statement_id:statementId,p_filename:file.name,
    p_mime:file.type,p_bytes:file.size,
  });
  const created=Array.isArray(prep)?prep[0]:prep;
  const target=created as {upload_id?:string;object_path?:string}|null;
  if(prepError||!target?.upload_id||!target.object_path) {
    console.error('[protection.evidence.prepare]',{code:prepError?.code});
    return NextResponse.json({error:'Não foi possível preparar o envio. Verifique as permissões e o limite de seis arquivos.'},{status:400});
  }
  const {error:uploadError}=await db.storage.from('vento-protection-evidence')
    .upload(target.object_path,file,{contentType:file.type,upsert:false,cacheControl:'0'});
  if(uploadError){
    console.error('[protection.evidence.upload]',{message:uploadError.message});
    return NextResponse.json({error:'Não foi possível armazenar o arquivo privado.'},{status:500});
  }
  const {error:confirmError}=await db.rpc('confirm_lesson_protection_evidence',{
    p_upload_id:target.upload_id,
  });
  if(confirmError){
    console.error('[protection.evidence.confirm]',{code:confirmError.code});
    return NextResponse.json({error:'O arquivo foi recebido mas ainda não foi confirmado. Procure o suporte.'},{status:500});
  }
  revalidatePath('/aluno/ocorrencias');
  revalidatePath('/instrutor/ocorrencias');
  revalidatePath('/admin/ocorrencias');
  return NextResponse.json({ok:true});
}
