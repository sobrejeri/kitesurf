import type { Metadata } from 'next';

import { setInstructorStatus } from '@/app/actions/admin';
import { ActionForm } from '@/components/action-form';
import { Avatar, Badge, Card, EmptyState, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllInstructors, type InstructorRow } from '@/lib/data';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Instrutores' };

const STATUS = {
  pending: { label: 'Em análise', tone: 'warning' },
  approved: { label: 'Aprovado · disponível', tone: 'success' },
  paused: { label: 'Pausado', tone: 'quiet' },
} as const;

function StatusForm({ row }: { row: InstructorRow }) {
  const next = row.status === 'approved' ? 'paused' : 'approved';
  return (
    <ActionForm
      action={setInstructorStatus}
      submitLabel={row.status === 'pending' ? 'Aprovar cadastro' : row.status === 'paused' ? 'Reativar' : 'Pausar'}
      submitVariant={next === 'approved' ? 'primary' : 'soft'}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="instructorId" value={row.id} />
      <input type="hidden" name="status" value={next} />
      <label className="sr-only" htmlFor={`reason-${row.id}`}>Motivo</label>
      <input id={`reason-${row.id}`} name="reason" required minLength={3} placeholder="Motivo (fica no histórico)" className={`${inputClass} !h-9 max-w-56`} />
    </ActionForm>
  );
}

export default async function InstructorsPage() {
  await requireRole(['admin'], '/admin/instrutores');
  const instructors = await listAllInstructors();
  return (
    <>
      <PageHeader eyebrow="Pessoas que fazem acontecer" title="Instrutores" lead="Analise cadastros, disponibilidade e áreas de atendimento." />
      {instructors.length === 0 ? (
        <EmptyState>Nenhum instrutor cadastrado. Instrutores criam conta em /cadastro escolhendo “Sou instrutor”.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {instructors.map((row) => (
            <Card key={row.id} className="!p-4 sm:!p-5">
              <div className="flex flex-wrap items-center gap-4">
                <Avatar initials={initials(row.profile?.full_name)} size={40} />
                <div className="min-w-[200px] flex-1">
                  <p className="text-[14px] font-[550]">{row.profile?.full_name || 'Sem nome'}</p>
                  <p className="text-[11px] text-muted">
                    {row.years_experience} anos · {row.beaches.map((b) => b.name).join(', ') || 'sem praia'} · {row.languages.join(', ')}
                    {row.has_equipment ? ' · com equipamento' : ''}
                  </p>
                </div>
                <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
              </div>
              <div className="mt-4 border-t border-line pt-4">
                <StatusForm row={row} />
              </div>
            </Card>
          ))}
        </div>
      )}
      <Note className="mt-5">A aprovação inclui o instrutor no final da fila. Pausar e reativar preserva a posição que ele já possuía. Toda mudança fica no histórico de auditoria.</Note>
    </>
  );
}
