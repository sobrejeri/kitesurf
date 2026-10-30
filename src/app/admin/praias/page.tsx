import type { Metadata } from 'next';

import { createBeach, updateBeach } from '@/app/actions/admin';
import { ActionForm } from '@/components/action-form';
import { AdminTitle, BeachTile, Panel } from '@/components/admin/kit';
import { Icon } from '@/components/icon';
import { Badge, EmptyState, Field, Note, inputClass } from '@/components/ui';
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
      <AdminTitle
        title="Praias e localizações"
        subtitle={`${beaches.length} localizações`}
        action={
          <a href="#nova-praia" className="btn-primary press inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 !text-[13px] text-white">
            <Icon name="plus" className="!h-4 !w-4" /> Nova praia
          </a>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ul className="grid content-start gap-3">
          {beaches.length === 0 ? <EmptyState>Nenhuma praia cadastrada.</EmptyState> : null}
          {beaches.map((beach) => (
            <li key={beach.id} className="rounded-[18px] border border-line bg-surface p-3">
              <div className="flex items-center gap-3">
                <BeachTile size={72} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[16px] font-semibold text-ink">{beach.name}</p>
                    <Badge tone={beach.active ? 'success' : 'quiet'}>{beach.active ? 'Ativa' : 'Inativa'}</Badge>
                  </div>
                  <p className="text-[12px] text-muted">{beach.region || 'Sem região'}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-label">
                    <Icon name="users" className="!h-4 !w-4" /> {servedBy(beach.id)} instrutor(es)
                  </p>
                </div>
              </div>
              <details className="mt-2 border-t border-line pt-2">
                <summary className="cursor-pointer px-1 text-[12px] font-medium text-brand">Editar</summary>
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
                      <option value="true">Ativa</option>
                      <option value="false">Inativa</option>
                    </select>
                  </Field>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>

        <Panel title="Nova praia" className="self-start scroll-mt-24">
          <div id="nova-praia" />
          <ActionForm action={createBeach} submitLabel="Cadastrar praia" className="grid gap-4">
            <Field label="Nome">
              <input name="name" required minLength={2} maxLength={60} placeholder="Ex.: Praia do Guriú" className={inputClass} />
            </Field>
            <Field label="Região" hint="Opcional, ex.: Cruz, Ceará.">
              <input name="region" maxLength={60} className={inputClass} />
            </Field>
          </ActionForm>
        </Panel>
      </div>
      <Note className="mt-4">
        Desativar uma praia não apaga nada: reservas existentes continuam, e ela só sai das novas buscas. Toda mudança fica na auditoria.
      </Note>
    </>
  );
}
