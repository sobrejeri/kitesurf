import { UnitForm } from '@/components/business/unit-form';
import { DemoBanner, PageHead } from '@/components/business/kit';

export const metadata = { title: 'Nova unidade' };
export default function NewUnitPage() {
  return (<><DemoBanner /><PageHead title="Nova unidade" subtitle="Cadastre cidade, endereço, localização e horários." /><UnitForm /></>);
}
