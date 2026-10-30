import type { Metadata } from 'next';

import { createBeach, updateBeach } from '@/app/actions/admin';
import { ActionForm } from '@/components/action-form';
import { Badge, Card, EmptyState, Field, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllBeaches, listAllInstructors } from '@/lib/data';

export const metadata: Metadata = { title: 'Praias' };

export default async function BeachesAdminPage() {
  await requireRole(['admin'], '/admin/praias');
  const [beaches, instructors] = await Promise.all([listAllBeaches(), listAllInstructors()]);
  const servedBy = (beachId: string) =>
    instructors.filter((row) => row.status === 'approved' && row.beaches.some((beach) => beach.id === beachId)).length;

  return (
    <>
      <PageHeader
        eyebrow="Onde as aulas acontecem"
        title="Praias"
        lead="Cadastre as praias atendidas. Os instrutores marcam em quais conseguem dar aula, e o aluno só encontra instrutores da praia escolhida."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card className="self-start">
          <h2 className="text-[16px]">Nova praia</h2>
          <ActionForm action={createBeach} submitLabel="Cadastrar praia" className="mt-4 grid gap-4">
            <Field label="Nome">
              <input name="name" required minLength={2} maxLength={60} placeholder="Ex.: Praia do Guriú" className={inputClass} />
            </Field>
            <Field label="Região" hint="Opcional. Aparece como referência para o aluno.">
              <input name="region" maxLength={60} placeholder="Ex.: Ceará" className={inputClass} />
            </Field>
          </ActionForm>
        </Card>

        <div className="grid content-start gap-3">
          {beaches.length === 0 ? <EmptyState>Nenhuma praia cadastrada.</EmptyState> : null}
          {beaches.map((beach) => (
            <Card key={beach.id} className="!p-4 sm:!p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[15px] font-[550]">{beach.name}</p>
                  <p className="text-[12px] text-muted">
                    {beach.region || 'Sem região'} · {servedBy(beach.id)} instrutor(es) aprovado(s)
                  </p>
                </div>
                <Badge tone={beach.active ? 'success' : 'quiet'}>{beach.active ? 'Ativa' : 'Inativa'}</Badge>
              </div>
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-[12px] font-[550] text-brand">Editar</summary>
                <ActionForm action={updateBeach} submitLabel="Salvar" className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="beachId" value={beach.id} />
                  <Field label="Nome">
                    <input name="name" defaultValue={beach.name} required minLength={2} maxLength={60} className={inputClass} />
                  </Field>
                  <Field label="Região">
                    <input name="region" defaultValue={beach.region} maxLength={60} className={inputClass} />
                  </Field>
                  <Field label="Situação">
                    <select name="active" defaultValue={String(beach.active)} className={inputClass}>
                      <option value="true">Ativa — aparece para alunos e instrutores</option>
                      <option value="false">Inativa — não recebe novas reservas</option>
                    </select>
                  </Field>
                </ActionForm>
              </details>
            </Card>
          ))}
        </div>
      </div>
      <Note className="mt-5">
        Desativar uma praia não apaga nada: reservas existentes continuam como estão, e ela só deixa de aparecer para novas reservas. Toda mudança fica no histórico de auditoria.
      </Note>
    </>
  );
}
