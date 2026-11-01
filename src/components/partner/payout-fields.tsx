'use client';

import { useState } from 'react';
import { Field, inputClass } from '@/components/ui';

type Payout={
  method:'pix'|'bank';holder_name:string;pix_key:string|null;bank_name:string|null;
  branch:string|null;account_number:string|null;account_type:'checking'|'savings'|null;
};
export function PartnerPayoutFields({saved}:{saved:Payout|null}) {
  const [method,setMethod]=useState<'pix'|'bank'>(saved?.method??'pix');
  return <>
    <Field label="Como deseja receber?">
      <select name="method" value={method} onChange={e=>setMethod(e.target.value as 'pix'|'bank')} className={inputClass}>
        <option value="pix">Pix</option>
        <option value="bank">Transferência bancária</option>
      </select>
    </Field>
    <Field label="Nome completo do titular">
      <input name="holderName" required minLength={2} maxLength={120}
        defaultValue={saved?.holder_name??''} className={inputClass}/>
    </Field>
    {method==='pix' ? <Field label="Chave Pix">
      <input name="pixKey" required minLength={5} maxLength={140}
        defaultValue={saved?.method==='pix'?saved.pix_key??'':''} className={inputClass}/>
    </Field> : <>
      <Field label="Banco"><input name="bankName" required maxLength={100}
        defaultValue={saved?.bank_name??''} className={inputClass}/></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Agência"><input name="branch" required maxLength={30}
          defaultValue={saved?.branch??''} className={inputClass}/></Field>
        <Field label="Conta"><input name="accountNumber" required maxLength={40}
          defaultValue={saved?.account_number??''} className={inputClass}/></Field>
      </div>
      <Field label="Tipo de conta">
        <select name="accountType" defaultValue={saved?.account_type??'checking'} className={inputClass}>
          <option value="checking">Corrente</option>
          <option value="savings">Poupança</option>
        </select>
      </Field>
    </>}
  </>;
}
