import { notFound } from 'next/navigation';

import { DemoBanner, PageHead } from '@/components/business/kit';
import { ServiceForm } from '@/components/business/service-form';
import { Panel } from '@/components/admin/kit';
import { Badge, Note } from '@/components/ui';
import { UNITS, UNIT_SERVICES } from '@/lib/business/demo';
import { instructorName } from '@/lib/business/rules';
import { WEEKDAYS, effectivePriceCents, hasOwnPrice, serviceOf } from '@/lib/business/services';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Detalhes do serviço' };

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = serviceOf(id);
  if (!service) notFound();
  const configs = UNIT_SERVICES.filter((u) => u.serviceId === id);
  return (
    <>
      <DemoBanner />
      <PageHead title={service.name} subtitle={service.description} />
      <ServiceForm service={service} />
      <Panel title="Habilitação por unidade" className="mt-5">
        <ul className="grid gap-3">
          {UNITS.map((unit) => {
            const c = configs.find((x) => x.unitId === unit.id);
            return (
              <li key={unit.id} className="rounded-[14px] border border-line p-3.5 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-ink">{unit.name} <span className="font-normal text-muted">· {unit.city}</span></strong>
                  <Badge tone={c ? 'success' : 'quiet'}>{c ? 'Habilitado' : 'Não habilitado'}</Badge>
                </div>
                {c ? (
                  <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    <div><dt className="text-muted">Preço nesta unidade</dt><dd className="tabular font-semibold text-ink">{formatMoney(effectivePriceCents(service, c))} <span className="font-normal text-muted">{hasOwnPrice(c) ? '(preço próprio)' : '(preço base)'}</span></dd></div>
                    <div><dt className="text-muted">Dias de atendimento</dt><dd className="text-ink">{c.weekdays.map((d) => WEEKDAYS[d]).join(', ')}</dd></div>
                    <div><dt className="text-muted">Instrutores</dt><dd className="text-ink">{c.instructorIds.map(instructorName).join(', ')}</dd></div>
                    <div><dt className="text-muted">Local real da atividade</dt><dd className="text-ink">{c.place}</dd></div>
                    <div><dt className="text-muted">Unidade responsável</dt><dd className="text-ink">{unit.name}</dd></div>
                    <div><dt className="text-muted">Cidade do atendimento</dt><dd className="text-ink">{unit.city}</dd></div>
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>
      <Note className="mt-4" title="Três informações diferentes">A cidade do atendimento, a unidade responsável e o local real da atividade são campos separados: uma unidade pode atender numa praia ou lagoa de outra localidade.</Note>
    </>
  );
}
