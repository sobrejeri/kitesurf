'use client';

import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import { prepareInstructorDocumentUpload, registerInstructorDocumentUpload } from '@/app/actions/documents';
import { Icon } from '@/components/icon';
import { inputClass } from '@/components/ui';

const MAX_SIZE=8*1024*1024;
const ACCEPTED:Readonly<Record<string,string>>={
  'application/pdf':'PDF',
  'image/jpeg':'JPG',
  'image/png':'PNG',
};
const KINDS=[
  {value:'identity',label:'Documento de identidade'},
  {value:'certification',label:'Certificação profissional'},
  {value:'insurance',label:'Seguro / responsabilidade'},
  {value:'other',label:'Outro documento'},
] as const;

function validMagic(bytes:Uint8Array,mime:string):boolean {
  if(mime==='application/pdf')return bytes.length>=5 &&
    String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
  if(mime==='image/jpeg')return bytes.length>=3 &&
    bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  if(mime==='image/png')return bytes.length>=8 &&
    [137,80,78,71,13,10,26,10].every((byte,i)=>bytes[i]===byte);
  return false;
}

/**
 * The file never traverses a Next.js Server Action: the server signs one
 * private path and Supabase Storage receives the binary directly.
 * The server verifies the uploaded bytes again before registration.
 */
export function InstructorDocumentUploader() {
  const router=useRouter();
  const formRef=useRef<HTMLFormElement>(null);
  const [phase,setPhase]=useState<'idle'|'authorizing'|'uploading'|'verifying'>('idle');
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [selectedName,setSelectedName]=useState('');
  const [pendingRegistration,setPendingRegistration]=useState<{kind:string;path:string;name:string}|null>(null);
  const busy=phase!=='idle';

  async function retryRegistration() {
    if(!pendingRegistration||busy)return;
    setPhase('verifying');
    setError(null);
    try {
      const result=await registerInstructorDocumentUpload(pendingRegistration);
      if(result.error){setError(result.error);return;}
      setPendingRegistration(null);
      setNotice(result.ok??'Documento recebido para análise.');
      formRef.current?.reset();
      setSelectedName('');
      router.refresh();
    }catch(cause){
      console.error('[document.client.retry]',cause);
      setError('A confirmação ainda não foi concluída. Tente novamente sem reenviar.');
    }finally{
      setPhase('idle');
    }
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy)return;
    setError(null);
    setNotice(null);
    setPendingRegistration(null);
    const data=new FormData(event.currentTarget);
    const file=data.get('document');
    const kind=data.get('kind');
    if(!(file instanceof File)||file.size===0||typeof kind!=='string') {
      setError('Selecione o tipo de documento e um arquivo.');
      return;
    }
    if(file.size>MAX_SIZE){
      setError('Este arquivo ultrapassa 8 MB. Reduza o tamanho ou envie outra versão.');
      return;
    }
    if(!Object.prototype.hasOwnProperty.call(ACCEPTED,file.type)){
      setError('Use PDF, JPG ou PNG. Fotos HEIC do iPhone precisam ser convertidas para JPG ou PDF.');
      return;
    }
    try {
      const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
      if(!validMagic(head,file.type)){
        setError('O arquivo não corresponde ao formato informado. Escolha um PDF, JPG ou PNG válido.');
        return;
      }
      setPhase('authorizing');
      const ticket=await prepareInstructorDocumentUpload({
        kind,name:file.name.slice(0,180)||'Documento',
        mime:file.type,size:file.size,
      });
      if(ticket.error||!ticket.path||!ticket.token){
        setError(ticket.error??'Não foi possível autorizar o envio.');
        return;
      }
      const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if(!url||!anon){
        setError('O aplicativo precisa de configuração do Supabase. Avise a administração.');
        return;
      }
      const storage=createClient(url,anon,{
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      }).storage.from('vento-instructor-documents');

      setPhase('uploading');
      const {error:uploadError}=await storage.uploadToSignedUrl(
        ticket.path,ticket.token,file,{contentType:file.type,cacheControl:'60'},
      );
      if(uploadError){
        console.error('[document.client.upload]',{status:uploadError.statusCode,message:uploadError.message});
        setError('O envio para o Supabase falhou. Confira sua conexão e tente novamente.');
        return;
      }

      setPhase('verifying');
      const registration={kind,path:ticket.path,name:file.name.slice(0,180)||'Documento'};
      setPendingRegistration(registration);
      const result=await registerInstructorDocumentUpload(registration);
      if(result.error){
        setError(result.error);
        return;
      }
      setPendingRegistration(null);

      formRef.current?.reset();
      setSelectedName('');
      setNotice(result.ok??'Documento recebido para análise.');
      router.refresh();
    }catch(cause){
      console.error('[document.client.unexpected]',cause);
      setError('Não foi possível concluir o envio. Verifique a conexão e tente novamente.');
    }finally{
      setPhase('idle');
    }
  }

  const phaseLabel:Record<typeof phase,string>={
    idle:'Enviar para análise',
    authorizing:'Preparando envio…',
    uploading:'Enviando ao Supabase…',
    verifying:'Conferindo documento…',
  };

  return <form ref={formRef} onSubmit={submit} className="mt-4 grid gap-4">
    <label htmlFor="doc-kind" className="text-[13px] font-semibold">Tipo de documento</label>
    <select id="doc-kind" name="kind" required disabled={busy} className={inputClass}>
      {KINDS.map(({value,label})=><option key={value} value={value}>{label}</option>)}
    </select>

    <label htmlFor="doc-file" className="text-[13px] font-semibold">Arquivo</label>
    <input id="doc-file" name="document" type="file"
      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
      disabled={busy}
      required
      onChange={e=>{setSelectedName(e.currentTarget.files?.[0]?.name??'');setError(null);setPendingRegistration(null);}}
      className="block w-full min-w-0 rounded-xl border border-line bg-canvas p-3 text-[13px] text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-brand"/>
    {selectedName?<p className="break-all text-[12px] text-muted">Selecionado: {selectedName}</p>:null}
    <p className="text-[12px] leading-relaxed text-muted">
      PDF, JPG ou PNG · máximo 8 MB. Envio privado diretamente ao Supabase.
      O arquivo só será disponibilizado para você e a administração.
    </p>

    <button type="submit" disabled={busy}
      className="press inline-flex min-h-12 items-center justify-center gap-2 justify-self-start rounded-full bg-brand px-5 text-[14px] font-bold text-on-brand disabled:cursor-wait disabled:opacity-70">
      <Icon name={busy?'clock':'file'} className="!h-[18px] !w-[18px]"/>
      {phaseLabel[phase]}
    </button>
    {busy?<p role="status" aria-live="polite" className="text-[12px] text-brand">
      {phaseLabel[phase]} Não feche esta tela durante o envio.
    </p>:null}
    {error?<div role="alert" className="rounded-xl border border-warm-line bg-warm-note px-4 py-3 text-[12px] text-warning">
      {error}
    </div>:null}
    {pendingRegistration&&!busy?(
      <button type="button" onClick={retryRegistration}
        className="press min-h-11 justify-self-start rounded-full border border-brand px-4 text-[13px] font-semibold text-brand">
        Concluir registro sem reenviar
      </button>
    ):null}
    {notice?<div role="status" className="rounded-xl border border-line bg-brand-wash px-4 py-3 text-[12px] text-ink">
      <Icon name="check" className="mr-2 inline-block !h-4 !w-4 text-success"/>{notice}
    </div>:null}
  </form>;
}
