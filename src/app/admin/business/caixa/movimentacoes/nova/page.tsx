import { MovementForm } from '@/components/business/cash-forms';
import { DemoBanner, PageHead } from '@/components/business/kit';

export const metadata = { title: 'Registrar movimentação' };
export default function NewMovementPage() {
  return (<><DemoBanner /><PageHead title="Registrar movimentação" subtitle="Venda presencial, suprimento, sangria ou despesa no caixa aberto." /><MovementForm /></>);
}
