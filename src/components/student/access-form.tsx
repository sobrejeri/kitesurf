'use client';

import { useState } from 'react';

import { DemoForm, Segmented } from '../interactive';
import { Button, Field, inputClass } from '../ui';

const MODES = ['Entrar', 'Criar conta', 'Recuperar acesso'] as const;

/**
 * Simulated sign-in. Nothing typed here leaves the page: there is no
 * authentication in the prototype, and the copy says so before anyone types.
 */
export function AccessForm() {
  const [mode, setMode] = useState<string>(MODES[0]);
  return (
    <>
      <Segmented label="Conta e acesso" options={MODES} value={mode} onChange={setMode} />
      <DemoForm confirmation="Acesso de demonstração. Nenhum dado foi enviado ou armazenado." className="mt-5 grid gap-4">
        {mode === 'Criar conta' ? (
          <Field label="Nome">
            <input className={inputClass} autoComplete="off" />
          </Field>
        ) : null}
        <Field label="E-mail de exemplo">
          <input className={inputClass} type="email" placeholder="voce@exemplo.com" autoComplete="off" />
        </Field>
        {mode !== 'Recuperar acesso' ? (
          <Field label="Senha de demonstração">
            <input className={inputClass} type="password" autoComplete="off" />
          </Field>
        ) : null}
        <Button type="submit">
          {mode === 'Entrar' ? 'Entrar na demonstração' : mode === 'Criar conta' ? 'Criar conta de teste' : 'Enviar instruções de teste'}
        </Button>
      </DemoForm>
    </>
  );
}
