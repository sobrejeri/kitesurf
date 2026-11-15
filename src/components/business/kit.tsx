import Link from 'next/link';

import { Badge, EmptyState, Note, type BadgeTone } from '@/components/ui';
import { DEMO_NOTICE, ROLES, type LinkStatus, type RoleId } from '@/lib/business/demo';

export { EmptyState };

export function DemoBanner() {
  return <Note tone="warning" title="Demonstração" className="mb-4">{DEMO_NOTICE}</Note>;
}

export function PageHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.5px] text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-[14px] border border-line bg-surface p-3.5 shadow-card">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="tabular mt-1 text-[24px] font-bold leading-tight text-ink">{value}</p>
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </article>
  );
}

export interface Column<T> { key: string; header: string; cell: (row: T) => React.ReactNode; className?: string }

/** Table on wide screens, stacked cards on phones; the same columns feed both. */
export function DataTable<T extends { id: string }>({ rows, columns, empty, page, pageSize = 6, hrefForPage }: {
  rows: readonly T[]; columns: readonly Column<T>[]; empty: string; page: number; pageSize?: number; hrefForPage: (page: number) => string;
}) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const slice = rows.slice((current - 1) * pageSize, current * pageSize);
  return (
    <div>
      <div className="relative hidden overflow-x-auto rounded-[14px] border border-line bg-surface lg:block">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead><tr className="border-b border-line bg-sand/60 text-[11.5px] uppercase tracking-[0.8px] text-muted">
            {columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-2.5 font-semibold ${c.className ?? ''}`}>{c.header}</th>)}
          </tr></thead>
          <tbody>{slice.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              {columns.map((c) => <td key={c.key} className={`px-4 py-3 align-middle text-ink ${c.className ?? ''}`}>{c.cell(r)}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <ul className="grid gap-2 lg:hidden">
        {slice.map((r) => (
          <li key={r.id} className="rounded-[14px] border border-line bg-surface p-3.5 text-[13px]">
            {columns.map((c, i) => (
              <div key={c.key} className={i === 0 ? 'mb-1.5 text-[14px] font-semibold text-ink' : 'flex items-start justify-between gap-3 py-1'}>
                {i === 0 ? c.cell(r) : <><span className="shrink-0 text-muted">{c.header}</span><span className="min-w-0 text-right text-ink">{c.cell(r)}</span></>}
              </div>
            ))}
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <nav aria-label="Paginação" className="mt-3 flex items-center justify-between text-[13px]">
          <span className="text-muted">Página {current} de {pages} · {rows.length} registros</span>
          <span className="flex gap-2">
            {current > 1 ? <Link href={hrefForPage(current - 1)} className="press rounded-full border border-line-ghost px-3 py-1.5 font-semibold text-brand">Anterior</Link> : null}
            {current < pages ? <Link href={hrefForPage(current + 1)} className="press rounded-full border border-line-ghost px-3 py-1.5 font-semibold text-brand">Próxima</Link> : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}

export const ROLE_TONE: Record<RoleId, BadgeTone> = { owner: 'brand', manager: 'success', finance: 'warning', attendant: 'quiet' };
export const RoleBadge = ({ role }: { role: RoleId }) => <Badge tone={ROLE_TONE[role]}>{ROLES.find((r) => r.id === role)?.label}</Badge>;

const LINK: Record<LinkStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Vínculo ativo', tone: 'success' }, invited: { label: 'Convite pendente', tone: 'warning' }, suspended: { label: 'Suspenso nesta escola', tone: 'danger' },
};
export const LinkBadge = ({ status }: { status: LinkStatus }) => <Badge tone={LINK[status].tone}>{LINK[status].label}</Badge>;

export const pageHref = (base: string, params: Record<string, string>, page: number) => {
  const q = new URLSearchParams(params);
  if (page > 1) q.set('pagina', String(page)); else q.delete('pagina');
  const s = q.toString();
  return s ? `${base}?${s}` : base;
};
