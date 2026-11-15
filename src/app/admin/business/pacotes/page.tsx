import { DemoBanner, PageHead } from '@/components/business/kit';
import { Badge, EmptyState } from '@/components/ui';
import { PACKAGES } from '@/lib/business/demo';
import { serviceOf, summarizePackage } from '@/lib/business/services';
import { formatBps, formatMoney } from '@/lib/format';

export const metadata = { title: 'Pacotes e promoções' };

export default function PackagesPage() {
  return (
    <>
      <DemoBanner />
      <PageHead title="Pacotes e promoções" subtitle="Várias aulas por um preço fechado, comparado ao preço avulso." />
      {PACKAGES.length === 0 ? <EmptyState>Nenhum pacote cadastrado.</EmptyState> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {PACKAGES.map((p) => {
            const s = summarizePackage(p);
            return (
              <li key={p.id} className="rounded-[16px] border border-line bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div><h2 className="text-[15px] font-semibold text-ink">{p.name}</h2><p className="text-[12px] text-muted">{serviceOf(p.serviceId)?.name} · {p.lessons} aulas · válido por {p.validDays} dias</p></div>
                  <Badge tone="success">Economia {formatBps(s.savingBps)}</Badge>
                </div>
                <p className="tabular mt-3 text-[24px] font-bold text-ink">{formatMoney(p.priceCents)}</p>
                <p className="mt-1 text-[12px] text-muted">{formatMoney(s.perLessonCents)} por aula · avulso {formatMoney(s.regularCents)} · economiza {formatMoney(s.savingCents)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
