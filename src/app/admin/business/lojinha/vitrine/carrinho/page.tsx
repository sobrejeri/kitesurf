import { CartActions, CartSummary } from '@/components/business/cart';

export const metadata = { title: 'Carrinho' };

export default function CartPage() {
  return (<div className="grid max-w-3xl gap-4"><h2 className="text-[20px] font-bold text-ink">Carrinho</h2><CartSummary editable /><div><CartActions /></div></div>);
}
