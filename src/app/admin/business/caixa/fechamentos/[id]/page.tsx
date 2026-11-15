import { notFound } from 'next/navigation';

import { DemoBanner, PageHead } from '@/components/business/kit';
import { Panel } from '@/components/admin/kit';
import { Badge, ButtonLink, Note } from '@/components/ui';
import { KIND_LABEL, METHOD_LABEL, closingSummary, sessionById } from '@/lib/business/caixa';
import { dayLabel, unitName } from '@/lib/business/rules';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Detalhes do fechamento' };

export default async function ClosingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = sessionById(id);
  const c = s ? closingSummary(s) : null;
  if (!s || !c) notFound();
  const t = c.totals;
  const lines: [string, number][] = [['Troco inicial', s.openingCents], ['Vendas em dinheiro', t.salesCashCents], ['Vendas Pix (recebido fora)', t.salesPixCents], ['Vendas cartão (maquininha da escola)', t.salesCardCents], ['Suprimentos', t.suppliesCents], ['Sangrias', t.bleedsCents], ['Despesas', t.expensesCents]];
  return (
    <>
      <DemoBanner />
      <PageHead title={`Fechamento · ${dayLabel(s.dayOffset)}`} subtitle={`${unitName(s.unitId)} · operador ${s.operator}`}
        action={<Badge tone={c.rec.status === 'ok' ? 'success' : c.rec.status === 'surplus' ? 'warning' : 'danger'}>{c.rec.status === 'ok' ? 'Sem diferença' : `${c.rec.status === 'surplus' ? 'Sobra' : 'Falta'} de ${formatMoney(Math.abs(c.rec.differenceCents))}`}</Badge>} />
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Arquivos do fechamento">
        <a href={`/admin/business/caixa/fechamentos/${id}/arquivo?formato=xlsx`} className="press inline-flex min-h-10 items-center gap-2 rounded-full bg-brand px-4 text-[13px] font-semibold text-on-brand">Baixar Excel (.xlsx)</a>
        <a href={`/admin/business/caixa/fechamentos/${id}/arquivo?formato=pdf`} className="press inline-flex min-h-10 items-center gap-2 rounded-full bg-brand px-4 text-[13px] font-semibold text-on-brand">Baixar PDF</a>
        <ButtonLink href={`/admin/business/caixa/comprovantes?tipo=closing&caixa=${id}&largura=58`} variant="ghost" size="sm">Térmica 58 mm</ButtonLink>
        <ButtonLink href={`/admin/business/caixa/comprovantes?tipo=closing&caixa=${id}&largura=80`} variant="ghost" size="sm">Térmica 80 mm</ButtonLink>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Resumo">
          <dl className="divide-y divide-line text-[13px]">
            {lines.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-2"><dt className="text-muted">{k}</dt><dd className="tabular text-ink">{formatMoney(v)}</dd></div>)}
            <div className="flex justify-between gap-3 py-2 font-semibold"><dt>Esperado em dinheiro</dt><dd className="tabular">{formatMoney(c.expectedCents)}</dd></div>
            <div className="flex justify-between gap-3 py-2 font-semibold"><dt>Contado</dt><dd className="tabular">{formatMoney(c.countedCents)}</dd></div>
            <div className="flex justify-between gap-3 py-2 font-semibold"><dt>Diferença</dt><dd className="tabular">{formatMoney(c.rec.differenceCents)}</dd></div>
          </dl>
          {s.closing?.reason ? <p className="mt-3 text-[13px] text-label">Motivo: {s.closing.reason}</p> : null}
        </Panel>
        <Panel title="Movimentações">
          <ul className="divide-y divide-line text-[13px]">{c.movements.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2"><span className="min-w-0"><strong className="text-ink">{KIND_LABEL[m.kind]}</strong> <span className="text-muted">{m.time}{m.method ? ` · ${METHOD_LABEL[m.method]}` : ''}</span><span className="block truncate text-muted">{m.note}</span></span><span className="tabular shrink-0 text-ink">{formatMoney(m.cents)}</span></li>))}</ul>
        </Panel>
      </div>
      <Note className="mt-4" title="Arquivos do histórico">No sistema real, o Excel e o PDF ficam guardados neste histórico. Na demonstração eles são gerados na hora a partir dos mesmos dados, e o resultado é igual.</Note>
    </>
  );
}
