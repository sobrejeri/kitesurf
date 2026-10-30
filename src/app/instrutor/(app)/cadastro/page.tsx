import type { Metadata } from 'next';

import { updateInstructorProfile } from '@/app/actions/instructor';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, Field, Note, inputClass } from '@/components/ui';
import { LANGUAGES } from '@/data/demo';
import { requireRole } from '@/lib/auth';
import { getOwnInstructor, listActiveBeaches } from '@/lib/data';

export const metadata: Metadata = { title: 'Perfil profissional' };

const STATUS = { pending: 'Em análise', approved: 'Aprovado', paused: 'Pausado' } as const;

export default async function InstructorProfileFormPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/cadastro');
  const [me, active] = await Promise.all([getOwnInstructor(viewer.id), listActiveBeaches()]);
  // Active beaches, plus any deactivated one the instructor still lists.
  const mine = new Set(me?.beaches.map((beach) => beach.id));
  const options = [...active, ...(me?.beaches.filter((beach) => !active.some((a) => a.id === beach.id)) ?? [])];
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.8px] text-ink md:text-[34px]">Perfil profissional</h1>
        {me ? <Badge tone={me.status === 'approved' ? 'success' : 'warning'}>{STATUS[me.status]}</Badge> : null}
      </div>
      <p className="mt-1 max-w-xl text-[13px] text-muted">Praias e idiomas definem quais pedidos chegam até você.</p>
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <ActionForm action={updateInstructorProfile} submitLabel="Salvar perfil" className="grid gap-5">
            <Field label="Anos de experiência">
              <input name="years" type="number" min={0} max={60} defaultValue={me?.years_experience ?? 0} className={inputClass} />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[12px] font-medium text-label">Praias onde você atende</legend>
              <div className="flex flex-wrap gap-2">
                {options.length === 0 ? <p className="text-[12px] text-muted">Nenhuma praia cadastrada pela operação ainda.</p> : null}
                {options.map((beach) => (
                  <label key={beach.id} className="flex items-center gap-2 rounded-full border border-line-input px-3.5 py-2 text-[12px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
                    <input type="checkbox" name="beachIds" value={beach.id} defaultChecked={mine.has(beach.id)} className="accent-brand" />
                    {beach.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[12px] font-medium text-label">Idiomas</legend>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((language) => (
                  <label key={language} className="flex items-center gap-2 rounded-full border border-line-input px-3.5 py-2 text-[12px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:text-brand">
                    <input type="checkbox" name="languages" value={language} defaultChecked={me?.languages.includes(language)} className="accent-brand" />
                    {language}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex gap-2.5 text-[12px] text-label">
              <input type="checkbox" name="hasEquipment" defaultChecked={me?.has_equipment} className="mt-0.5 accent-brand" />
              Tenho equipamentos e estrutura de apoio para oferecer as aulas.
            </label>
          </ActionForm>
        </Card>
        <div className="grid content-start gap-5">
          <Note title="Como funciona">
            A operação analisa seu perfil antes de liberar pedidos. Novos instrutores aprovados entram no final da fila; depois disso, recusas e expirações preservam sua prioridade.
          </Note>
          <Note tone="warning">Documentos e dados de recebimento serão pedidos na etapa de verificação. Não envie documentos por aqui.</Note>
        </div>
      </div>
    </>
  );
}
