import Link from 'next/link';

import { STAFF_TABS, SectionTabs } from '@/components/business/company-kit';
import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { Note } from '@/components/ui';
import { AUDIT_LABEL, type AuditAction } from '@/lib/business/demo';
import { agoLabel, auditInScope, employeeById } from '@/lib/business/company';
import { parseScope, scopeQuery, unitName, unitsInScope } from '@/lib/business/rules';

export const metadata = { title: 'Auditoria' };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const scope = parseScope(params); const q = scopeQuery(scope);
  const action = typeof params.acao === 'string' && params.acao in AUDIT_LABEL ? params.acao : ''; const page = Number(typeof params.pagina === 'string' ? params.pagina : 1) || 1;
  const rows = auditInScope(new Set(unitsInScope(scope).map((u) => u.id)), action);
  const base: Record<string, string> = scope.unidade ? { unidade: scope.unidade } : scope.cidade ? { cidade: scope.cidade } : {};
  const chip = (a: string, label: string) => <Link key={a} href={pageHref('/admin/business/auditoria', a ? { ...base, acao: a } : base, 1)} aria-current={action === a ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${action === a ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{label}</Link>;
  return (
    <>
      <DemoBanner />
      <PageHead title="Histórico de ações" subtitle="Quem fez o quê, em qual unidade e quando. Registros não podem ser editados nem apagados." />
      <SectionTabs label="Seções da equipe" tabs={STAFF_TABS} active="/admin/business/auditoria" query={q} />
      <nav aria-label="Filtro de ação" className="mb-3 flex flex-wrap gap-1.5">{chip('', 'Todas')}{(Object.keys(AUDIT_LABEL) as AuditAction[]).map((a) => chip(a, AUDIT_LABEL[a]))}</nav>
      <DataTable rows={rows} page={page} pageSize={6} hrefForPage={(n) => pageHref('/admin/business/auditoria', action ? { ...base, acao: action } : base, n)} empty="Nenhuma ação neste filtro."
        columns={[{ key: 'w', header: 'Quando', cell: (a) => agoLabel(a.minutesAgo), className: 'tabular' }, { key: 'a', header: 'Ação', cell: (a) => <span className="font-semibold">{AUDIT_LABEL[a.action]}</span> },
          { key: 'p', header: 'Quem fez', cell: (a) => <Link href={`/admin/business/funcionarios/${a.actorId}`} className="text-brand">{employeeById(a.actorId)?.name ?? 'Desconhecido'}</Link> }, { key: 'u', header: 'Unidade', cell: (a) => (a.unitId ? unitName(a.unitId) : 'Empresa') },
          { key: 'd', header: 'Detalhe', cell: (a) => `${a.target}: ${a.detail}` }]} />
      <Note className="mt-4" title="Somente acréscimo">No sistema real, este histórico é protegido no banco: só aceita novas linhas.</Note>
    </>
  );
}
