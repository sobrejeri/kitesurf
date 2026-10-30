import type { Metadata } from 'next';

import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { VEHICLES } from '@/data/demo';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Transporte de apoio' };

export default function TransportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Frota e acompanhamento"
        title="Transporte de apoio"
        lead="Cadastre os veículos e organize o apoio de cada encontro. Valores e serviços são demonstrativos."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-[16px]">Veículos cadastrados</h2>
            <span className="text-[11px] text-muted">{VEHICLES.length} veículo(s)</span>
          </div>
          <ul className="mt-4 grid gap-3">
            {VEHICLES.map((vehicle) => (
              <li key={vehicle.code} className="flex items-center justify-between gap-3 rounded-search border border-line p-4">
                <div>
                  <p className="text-[13px] font-[550]">{vehicle.name}</p>
                  <p className="tabular text-[11px] text-muted">{vehicle.code} · {vehicle.seats} passageiros · {formatMoney(vehicle.hourlyCents)}/h</p>
                </div>
                <Badge>{vehicle.status}</Badge>
              </li>
            ))}
          </ul>
          <Button variant="soft" icon="plus" className="mt-4">Adicionar veículo</Button>
        </Card>
        <Card>
          <h2 className="text-[16px]">Apoio por encontro</h2>
          <p className="mt-1 text-[12px] text-muted">A reserva ocupa o veículo escolhido após o pagamento. Confirme também quem acompanha o cliente.</p>
          <div className="mt-4">
            <EmptyState action={<ButtonLink href="/aluno/reservar" size="sm">Montar reserva de teste</ButtonLink>}>
              Nenhum transporte solicitado. O cliente seleciona o adicional ao montar a aula.
            </EmptyState>
          </div>
        </Card>
      </div>
    </>
  );
}
