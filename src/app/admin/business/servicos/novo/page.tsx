import { DemoBanner, PageHead } from '@/components/business/kit';
import { ServiceForm } from '@/components/business/service-form';

export const metadata = { title: 'Novo serviço' };
export default function NewServicePage() {
  return (<><DemoBanner /><PageHead title="Novo serviço" subtitle="Duração, capacidade e preço base. Cada unidade pode ter preço próprio." /><ServiceForm /></>);
}
