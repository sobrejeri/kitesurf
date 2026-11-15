import Link from 'next/link';

import { INSTRUCTOR_TABS, SectionTabs } from '@/components/business/company-kit';
import { DataTable, DemoBanner, PageHead, pageHref } from '@/components/business/kit';
import { Badge, type BadgeTone } from '@/components/ui';
import { INSTRUCTORS, LESSON_HISTORY, type HistoryStatus } from '@/lib/business/demo';
import { historyInScope } from '@/lib/business/instructors';
import { dayLabel, instructorName, parseScope, scopeQuery, unitName, unitsInScope } from '@/lib/business/rules';
import { serviceOf } from '@/lib/business/services';
import { formatBps } from '@/lib/format';

export const metadata = { title: 'Histórico de aulas' };
const STATUS: Record<HistoryStatus, { label: string; tone: BadgeTone }> = { done: { label: 'Concluída', tone: 'success' }, cancelled: { label: 'Cancelada', tone: 'danger' }, no_show: { label: 'Aluno faltou', tone: 'warning' } };

export default async function LessonHistory({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const scope = parseScope(params);
  const inst = typeof params.instrutor === 'string' && INSTRUCTORS.some((i) => i.id === params.instrutor) ? params.instrutor : '';
  const status = typeof params.status === 'string' && params.status in STATUS ? params.status : ''; const page = Number(typeof params.pagina === 'string' ? params.pagina : 1) || 1;
  const rows = historyInScope(new Set(unitsInScope(scope).map((u) => u.id)), inst, status);
  const base: Record<string, string> = scope.unidade ? { unidade: scope.unidade } : scope.cidade ? { cidade: scope.cidade } : {};
  const keep = { ...base, ...(inst ? { instrutor: inst } : {}), ...(status ? { status } : {}) };
  const chip = (href: string, label: string, on: boolean) => <Link key={href + label} href={href} aria-current={on ? 'page' : undefined} className={`press inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold ${on ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{label}</Link>;
  const P = '/admin/business/instrutores/historico';
  return (
    <>
      <DemoBanner />
      <PageHead title="Histórico de aulas" subtitle="Aulas passadas desta escola, com a comissão congelada no dia de cada uma." />
      <SectionTabs label="Seções de instrutores" tabs={INSTRUCTOR_TABS} active={P} query={scopeQuery(scope)} />
      <nav aria-label="Filtro de instrutor" className="mb-2 flex flex-wrap gap-1.5">{chip(pageHref(P, { ...base, ...(status ? { status } : {}) }, 1), 'Todos os instrutores', !inst)}{INSTRUCTORS.filter((i) => LESSON_HISTORY.some((h) => h.instructorId === i.id)).map((i) => chip(pageHref(P, { ...base, instrutor: i.id, ...(status ? { status } : {}) }, 1), i.name, inst === i.id))}</nav>
      <nav aria-label="Filtro de situação" className="mb-3 flex flex-wrap gap-1.5">{chip(pageHref(P, { ...base, ...(inst ? { instrutor: inst } : {}) }, 1), 'Todas as situações', !status)}{(Object.keys(STATUS) as HistoryStatus[]).map((s) => chip(pageHref(P, { ...base, ...(inst ? { instrutor: inst } : {}), status: s }, 1), STATUS[s].label, status === s))}</nav>
      <DataTable rows={rows} page={page} pageSize={6} hrefForPage={(n) => pageHref(P, keep, n)} empty="Nenhuma aula neste filtro."
        columns={[{ key: 'd', header: 'Data', cell: (h) => `${dayLabel(h.dayOffset)}, ${h.start}`, className: 'tabular' }, { key: 'i', header: 'Instrutor', cell: (h) => <span className="font-semibold">{instructorName(h.instructorId)}</span> }, { key: 's', header: 'Serviço', cell: (h) => `${serviceOf(h.serviceId)?.name} · ${unitName(h.unitId)}` },
          { key: 'c', header: 'Comissão', cell: (h) => formatBps(h.commissionBps), className: 'tabular' }, { key: 't', header: 'Situação', cell: (h) => <Badge tone={STATUS[h.status].tone}>{STATUS[h.status].label}</Badge> }]} />
    </>
  );
}
