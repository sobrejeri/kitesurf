import { CartSummary, OrderRequestForm } from '@/components/business/cart';

export const metadata = { title: 'Resumo do pedido' };

export default function SummaryPage() {
  return (<div className="grid max-w-3xl gap-4"><h2 className="text-[20px] font-bold text-ink">Resumo do pedido</h2><CartSummary editable={false} /><OrderRequestForm /></div>);
}
