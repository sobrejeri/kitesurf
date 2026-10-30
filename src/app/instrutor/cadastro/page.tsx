import type { Metadata } from 'next';

import { ChipChoice, DemoForm } from '@/components/interactive';
import { Button, Card, Eyebrow, Field, Note, inputClass } from '@/components/ui';
import { BEACHES, LANGUAGES } from '@/data/demo';

export const metadata: Metadata = { title: 'Cadastro de instrutor' };

const HOW = [
  ['Apresente seu trabalho', 'Cadastre locais, idiomas e estrutura.'],
  ['Receba a aprovação', 'A equipe analisa seu perfil.'],
  ['Ative sua disponibilidade', 'Entre no rodízio de oportunidades.'],
] as const;

export default function InstructorSignupPage() {
  return (
    <>
      <Eyebrow>Faça parte da rede</Eyebrow>
      <h1 className="mt-2 text-[28px] tracking-[-0.9px] sm:text-[32px]">Seu próximo aluno pode estar aqui.</h1>
      <p className="mt-1 max-w-xl text-[13px] text-muted">
        Apresente seu trabalho. Seu perfil passa por análise antes de receber solicitações.
      </p>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <DemoForm confirmation="Cadastro de teste enviado para análise. Ele aparece em Admin › Instrutores." className="grid gap-6">
            <fieldset className="grid gap-4">
              <legend className="mb-3 text-[14px] font-semibold">01. Sobre você</legend>
              <Field label="Nome profissional"><input className={inputClass} required /></Field>
              <Field label="E-mail"><input className={inputClass} type="email" placeholder="voce@exemplo.com" required /></Field>
              <Field label="Anos de experiência"><input className={inputClass} type="number" min={0} max={60} inputMode="numeric" /></Field>
            </fieldset>
            <fieldset className="grid gap-4 border-t border-line pt-5">
              <legend className="mb-3 text-[14px] font-semibold">02. Seu atendimento</legend>
              <div className="grid gap-2"><span className="text-[12px] font-medium text-label">Praias</span><ChipChoice label="Praias" multiple options={Object.values(BEACHES)} defaultSelected={['Preá']} /></div>
              <div className="grid gap-2"><span className="text-[12px] font-medium text-label">Idiomas</span><ChipChoice label="Idiomas" multiple options={LANGUAGES} defaultSelected={['Português']} /></div>
              <label className="flex gap-2.5 text-[12px] text-label"><input type="checkbox" className="mt-0.5 accent-brand" />Tenho equipamentos e estrutura de apoio para oferecer as aulas.</label>
            </fieldset>
            <fieldset className="grid gap-4 border-t border-line pt-5">
              <legend className="mb-3 text-[14px] font-semibold">03. Revisão do cadastro</legend>
              <p className="text-[12px] text-muted">A operação final solicitará identificação, comprovação de formação e dados de recebimento na etapa de verificação.</p>
              <Note tone="warning">Este é um cadastro de teste. Não envie documentos pessoais nem dados bancários nesta demonstração.</Note>
              <label className="flex gap-2.5 text-[12px] text-label"><input type="checkbox" required className="mt-0.5 accent-brand" />Estou cadastrando um perfil demonstrativo.</label>
            </fieldset>
            <Button type="submit" className="justify-self-start">Enviar cadastro para análise</Button>
          </DemoForm>
        </Card>
        <Card tone="tinted" className="self-start">
          <Eyebrow>Como funciona</Eyebrow>
          <h2 className="mt-2 text-[17px]">Mais tempo ensinando, mais clareza na operação.</h2>
          <ol className="mt-4 grid gap-4">
            {HOW.map(([title, body], index) => (
              <li key={title} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface text-[12px] font-[550] text-brand">{index + 1}</span>
                <span><strong className="block text-[13px] font-[550]">{title}</strong><span className="text-[12px] text-muted">{body}</span></span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[11px] leading-relaxed text-muted">
            Novos instrutores aprovados entram no final da fila. Depois disso, pausas, recusas e expirações preservam sua prioridade.
          </p>
        </Card>
      </div>
    </>
  );
}
