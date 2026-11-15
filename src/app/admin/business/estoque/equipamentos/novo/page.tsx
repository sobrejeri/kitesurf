import { DemoBanner, PageHead } from '@/components/business/kit';
import { EquipmentForm } from '@/components/business/stock-forms';

export const metadata = { title: 'Novo equipamento' };
export default function NewEquipmentPage() { return (<><DemoBanner /><PageHead title="Novo equipamento" subtitle="Identificação individual, tipo, unidade e estado de conservação." /><EquipmentForm /></>); }
