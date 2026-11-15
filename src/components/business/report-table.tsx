import Link from 'next/link';

import { FinanceTabs, PeriodNav } from '@/components/business/finance-kit';
import { DemoBanner, PageHead } from '@/components/business/kit';

const VIEWS = [{ id: 'consolidado', label: 'Consolidado' }, { id: 'unidades', label: 'Por unidade' }, { id: 'funcionarios', label: 'Por funcionário' }] as const;

/** Frame shared by the three financial reports: view switch, period, and the file downloads. */
export function ReportFrame({ view, days, keep, query, title, subtitle, children }: { view: string; days: number; keep: Record<string, string>; query: string; title: string; subtitle: string; children: React.ReactNode }) {
  const base = `/admin/business/financeiro/relatorios/${view}`;
  const file = (fmt: string) => `/admin/business/financeiro/relatorios/arquivo?formato=${fmt}&dias=${days}${query ? `&${query.slice(1)}` : ''}`;
  return (
    <>
      <DemoBanner />
      <PageHead title={title} subtitle={subtitle} />
      <FinanceTabs active={base} query={query} />
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Visão do relatório">{VIEWS.map((v) => (
        <Link key={v.id} href={`/admin/business/financeiro/relatorios/${v.id}${query}`} aria-current={v.id === view ? 'page' : undefined} className={`press rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${v.id === view ? 'border-brand bg-brand-soft text-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>{v.label}</Link>))}</div>
      <PeriodNav base={base} keep={keep} days={days} />
      {children}
      <div className="mt-4 flex flex-wrap gap-2"><a href={file('xlsx')} className="press inline-flex min-h-10 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-on-brand">Baixar Excel (.xlsx)</a><a href={file('pdf')} className="press inline-flex min-h-10 items-center rounded-full bg-brand px-4 text-[13px] font-semibold text-on-brand">Baixar PDF</a></div>
    </>
  );
}
