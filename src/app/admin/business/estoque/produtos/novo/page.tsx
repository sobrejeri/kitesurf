import { DemoBanner, PageHead } from '@/components/business/kit';
import { ProductForm } from '@/components/business/stock-forms';

export const metadata = { title: 'Novo produto' };
export default function NewProductPage() { return (<><DemoBanner /><PageHead title="Novo produto" subtitle="Nome, código único, preço e estoque mínimo." /><ProductForm /></>); }
