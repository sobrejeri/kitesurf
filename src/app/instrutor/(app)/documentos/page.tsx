import type { Metadata } from 'next';

import { ChipChoice, DemoForm } from '@/components/interactive';
import { Button, Card, EmptyState, Field, PageHeader, inputClass } from '@/components/ui';
import { DEMO_PROFILES } from '@/data/demo';

export const metadata: Metadata = { title: 'Meus documentos' };

export default function DocumentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Formação e estrutura"
        title="Documentos dos instrutores"
        lead="O esboço registra referências de documentos de teste. Upload e validação reais serão integrados depois."
      />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="grid gap-2">
            <span className="text-[12px] font-medium text-label">Perfil de demonstração</span>
            <ChipChoice label="Perfil de demonstração" options={DEMO_PROFILES} defaultSelected={['Rafael']} />
          </div>
          <DemoForm confirmation="Referência enviada para análise na demonstração." className="mt-5 grid gap-4">
            <Field label="Tipo">
              <select className={inputClass} defaultValue="Identificação">
                {['Identificação', 'Formação', 'Equipamentos'].map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Nome do documento de teste"><input className={inputClass} /></Field>
            <Field label="Referência ou observação"><input className={inputClass} /></Field>
            <Button type="submit" className="justify-self-start">Enviar referência para análise</Button>
          </DemoForm>
        </Card>
        <EmptyState>Nenhum documento enviado. Na área do instrutor, escolha o perfil e envie uma referência fictícia.</EmptyState>
      </div>
    </>
  );
}
