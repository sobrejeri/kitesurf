import Link from 'next/link';

import { PrintButton } from '@/components/business/print-button';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { Note } from '@/components/ui';
import { PRINT_PURPOSES, type PrintPurpose } from '@/lib/business/demo';
import { thermalColumns, thermalReceipt, type ThermalWidth } from '@/lib/business/caixa';
import { sampleReceipt } from '@/lib/business/receipts';

export const metadata = { title: 'Comprovantes térmicos' };

export default async function ThermalPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const kind: PrintPurpose = PRINT_PURPOSES.some((p) => p.id === one(params.tipo)) ? (one(params.tipo) as PrintPurpose) : 'closing';
  const width: ThermalWidth = one(params.largura) === '58' ? 58 : 80;
  const caixa = /^cs-\d$/.test(one(params.caixa)) ? one(params.caixa) : 'cs-2';
  const r = sampleReceipt(kind, caixa);
  const text = thermalReceipt(r.title, r.rows, r.note, width);
  const href = (k: PrintPurpose, w: ThermalWidth) => `/admin/business/caixa/comprovantes?tipo=${k}&largura=${w}&caixa=${caixa}`;
  return (
    <>
      <style>{`@media print{@page{size:${width}mm auto;margin:2mm}}`}</style>
      <div className="print:hidden"><DemoBanner /><PageHead title="Comprovantes térmicos" subtitle="Prévia do papel de 58 mm (32 colunas) ou 80 mm (48 colunas)." action={<PrintButton />} /></div>
      <div className="grid gap-5 lg:grid-cols-[260px_1fr] print:block">
        <nav aria-label="Tipo de comprovante" className="grid content-start gap-1.5 print:hidden">
          <div className="mb-1 flex gap-2" role="group" aria-label="Largura do papel">{([58, 80] as const).map((w) => (
            <Link key={w} href={href(kind, w)} aria-current={w === width ? 'true' : undefined} className={`press flex-1 rounded-full border px-3 py-1.5 text-center text-[13px] font-semibold ${w === width ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink'}`}>{w} mm</Link>))}</div>
          {PRINT_PURPOSES.map((p) => <Link key={p.id} href={href(p.id, width)} aria-current={p.id === kind ? 'true' : undefined} className={`press rounded-[12px] px-3 py-2 text-[13px] ${p.id === kind ? 'bg-brand-soft font-semibold text-brand' : 'text-ink hover:bg-brand-wash'}`}>{p.label}</Link>)}
        </nav>
        <div className="overflow-x-auto">
          <pre aria-label={`Prévia ${width} mm`} data-width={width} data-cols={thermalColumns(width)} className="mx-auto rounded-[6px] border border-dashed border-line-ghost bg-white p-2 font-mono text-[11px] leading-[1.35] text-black print:border-0 print:p-0" style={{ width: `${thermalColumns(width)}ch`, boxSizing: 'content-box' }}>{text}</pre>
        </div>
      </div>
      <Note className="mt-4 print:hidden" title="Prévia, não integração">Esta tela só prepara o papel. Não há conexão direta com impressoras: a impressão passa pelo diálogo do navegador.</Note>
    </>
  );
}
