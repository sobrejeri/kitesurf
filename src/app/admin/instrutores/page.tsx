import type { Metadata } from 'next';

import { FilterList, type FilterEntry } from '@/components/admin/filter-list';
import { AdminTitle, ListCard, PhotoTile } from '@/components/admin/kit';
import { INSTRUCTOR_STATUS } from '@/components/admin/labels';
import { Icon } from '@/components/icon';
import { Badge } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllInstructors } from '@/lib/data';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Instrutores' };

export default async function InstructorsPage() {
  await requireRole(['admin'], '/admin/instrutores');
  const instructors = await listAllInstructors();

  const entries: FilterEntry[] = instructors.map((row) => {
    const name = row.profile?.full_name || 'Sem nome';
    const beaches = row.beaches.map((beach) => beach.name).join(', ');
    return {
      key: row.id,
      groups: [row.status],
      text: `${name} ${beaches} ${row.languages.join(' ')}`.toLowerCase(),
      node: (
        <ListCard href={`/admin/instrutores/${row.id}`}>
          <div className="flex items-start gap-3">
            <PhotoTile initials={initials(name)} size={64} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-[16px] font-semibold text-ink">{name}</p>
                <Badge tone={INSTRUCTOR_STATUS[row.status].tone}>{INSTRUCTOR_STATUS[row.status].label}</Badge>
              </div>
              <p className="mt-1 text-[12px] text-muted">{row.years_experience} anos de experiência</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-label">
                <Icon name="pin" className="!h-4 !w-4 shrink-0 text-muted" /> {beaches || 'Nenhuma praia marcada'}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-label">
                <Icon name="globe" className="!h-4 !w-4 shrink-0 text-muted" /> {row.languages.join(', ')}
              </p>
            </div>
          </div>
        </ListCard>
      ),
    };
  });

  return (
    <>
      <AdminTitle title="Instrutores" subtitle={`${instructors.length} cadastrados`} />
      <FilterList
        placeholder="Buscar instrutor..."
        empty="Nenhum instrutor encontrado."
        chips={[
          { id: 'pending', label: 'Em análise' },
          { id: 'approved', label: 'Aprovados' },
          { id: 'paused', label: 'Pausados' },
        ]}
        entries={entries}
      />
      <p className="mt-5 text-center text-[12px] text-muted">
        Instrutores criam a própria conta em /cadastro, escolhendo “Sou instrutor”, e aparecem aqui em análise.
      </p>
    </>
  );
}
