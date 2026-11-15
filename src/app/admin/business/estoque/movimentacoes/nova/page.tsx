import { DemoBanner, PageHead } from '@/components/business/kit';
import { StockMovementForm } from '@/components/business/stock-forms';

export const metadata = { title: 'Registrar movimentação de estoque' };
export default function NewStockMovementPage() { return (<><DemoBanner /><PageHead title="Registrar movimentação" subtitle="Entrada, saída por venda ou ajuste de contagem. O estoque nunca fica negativo." /><StockMovementForm /></>); }
