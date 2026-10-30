import type { Metadata } from 'next';

import { DemoForm } from '@/components/interactive';
import { Policies } from '@/components/shared';
import { Button, Card, Field, Note, inputClass, textareaClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Políticas comerciais' };

export default function CommercialPoliciesPage() {
  return (
    <Policies>
      <Card>
        <h2 className="text-[16px]">Rascunho das regras comerciais</h2>
        <DemoForm confirmation="Rascunho comercial salvo na demonstração." className="mt-4 grid gap-4">
          <div className="max-w-xs">
            <Field label="Antecedência proposta para cancelar (horas)">
              <input className={inputClass} type="number" min={0} defaultValue={24} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Cancelamento fora do prazo"><textarea className={textareaClass} /></Field>
          <Field label="Ausência de aluno ou instrutor"><textarea className={textareaClass} /></Field>
          <Field label="Condições de vento"><textarea className={textareaClass} /></Field>
          <Note>Esses campos documentam propostas. Não executam taxas ou descontos automáticos.</Note>
          <Button type="submit" className="justify-self-start">Salvar rascunho comercial</Button>
        </DemoForm>
      </Card>
    </Policies>
  );
}
