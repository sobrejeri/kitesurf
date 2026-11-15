import { AddRentalForm } from '@/components/business/cart';
import { EQUIPMENT, UNITS, type EquipmentType } from '@/lib/business/demo';
import { rentalAvailable } from '@/lib/business/shop';
import { HOURLY_CENTS, TYPE_LABEL } from '@/lib/business/stock';
import { formatMoney } from '@/lib/format';

export const metadata = { title: 'Aluguel de equipamentos' };

export default function RentalCatalog() {
  const types = Object.keys(HOURLY_CENTS) as EquipmentType[];
  return (
    <div className="grid gap-6">
      <p className="max-w-2xl text-[13px] text-muted">Cada equipamento é individual e só aparece como livre se não estiver alugado, em manutenção ou aposentado.</p>
      {types.map((t) => (
        <section key={t} aria-label={TYPE_LABEL[t]} className="grid gap-3">
          <h2 className="text-[16px] font-semibold text-ink">{TYPE_LABEL[t]} <span className="tabular text-[13px] font-normal text-muted">· {formatMoney(HOURLY_CENTS[t])} por hora</span></h2>
          <p className="text-[12.5px] text-muted">{UNITS.filter((u) => u.active).map((u) => `${u.name}: ${rentalAvailable(t, u.id)} de ${EQUIPMENT.filter((e) => e.type === t && e.unitId === u.id && !e.retired).length}`).join(' · ')}</p>
          <AddRentalForm type={t} />
        </section>))}
    </div>
  );
}
