'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass } from '@/components/ui';

export function EvidenceUpload({area,statementId}:{
  area:'aluno'|'instrutor'|'admin'; statementId:string;
}) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!file||busy)return;
    if(file.size<1||file.size>5*1024*1024){
      setMessage('O arquivo deve ter no máximo 5 MB.');return;
    }
    setBusy(true);setMessage('');
    try{
      const body=new FormData();
      body.set('statementId',statementId);body.set('file',file);
      const res=await fetch('/api/protection-evidence?area='+encodeURIComponent(area),{
        method:'POST',body,credentials:'same-origin',
      });
      const data=await res.json() as {ok?:boolean;error?:string};
      if(!res.ok||!data.ok)throw new Error(data.error??'O envio não foi concluído.');
      setMessage('Prova anexada em armazenamento privado.');
      setFile(null);
      (event.currentTarget as HTMLFormElement | null)?.reset();
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:'Erro ao enviar prova.');}
    finally{setBusy(false);}
  };
  return <form onSubmit={submit} className="mt-4 grid gap-2 border-t border-line pt-4">
    <label className="text-[12px] font-semibold text-ink" htmlFor={'protection-file-'+statementId}>
      Anexar prova privada ao seu relato
    </label>
    <input id={'protection-file-'+statementId} type="file"
      accept="image/jpeg,image/png,image/webp,application/pdf"
      onChange={e=>setFile(e.target.files?.[0]??null)}
      className="block w-full text-[12px] text-muted" disabled={busy}/>
    <p className="text-[11px] text-muted">
      JPEG, PNG, WebP ou PDF · até 5 MB. Visível apenas para quem enviou e para a administração.
    </p>
    <button type="submit" disabled={busy||!file}
      className={buttonClass('soft','sm','justify-self-start')}>
      {busy?'Enviando…':'Enviar prova'}
    </button>
    {message?<p aria-live="polite" className="text-[12px] text-muted">{message}</p>:null}
  </form>;
}
