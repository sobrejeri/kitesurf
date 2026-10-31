'use client';

import { useState } from 'react';

import { saveInstructorPayout } from '@/app/actions/instructor-profile';
import { ActionForm } from '@/components/action-form';
import { Field, inputClass } from '@/components/ui';

export function InstructorPayoutForm({
  holderName,
  initialMethod,
}: {
  holderName: string;
  initialMethod: 'pix' | 'bank';
}) {
  const [method, setMethod] = useState<'pix' | 'bank'>(initialMethod);

  return (
    <ActionForm action={saveInstructorPayout} submitLabel="Salvar dados de recebimento" wideSubmit className="grid gap-4">
      <Field label="Como deseja receber?">
        <select name="method" value={method} onChange={(e) => setMethod(e.target.value as 'pix' | 'bank')} className={inputClass}>
          <option value="pix">Pix</option>
          <option value="bank">Conta bancária</option>
        </select>
      </Field>
      <Field label="Nome do titular">
        <input name="holderName" autoComplete="name" defaultValue={holderName} minLength={2} maxLength={120} required className={inputClass} />
      </Field>
      {method === 'pix' ? (
        <Field label="Chave Pix" hint="A chave não será exibida publicamente.">
          <input name="pixKey" autoComplete="off" placeholder="Informe sua chave Pix" minLength={5} maxLength={140} required className={inputClass} />
        </Field>
      ) : (
        <>
          <Field label="Banco">
            <input name="bankName" autoComplete="off" placeholder="Nome ou código do banco" maxLength={100} required className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Agência">
              <input name="branch" autoComplete="off" inputMode="numeric" maxLength={30} required className={inputClass} />
            </Field>
            <Field label="Tipo de conta">
              <select name="accountType" className={inputClass}>
                <option value="checking">Corrente</option>
                <option value="savings">Poupança</option>
              </select>
            </Field>
          </div>
          <Field label="Conta com dígito">
            <input name="accountNumber" autoComplete="off" maxLength={40} required className={inputClass} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
