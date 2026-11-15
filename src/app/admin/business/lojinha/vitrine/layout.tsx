import { CartLink, CartProvider } from '@/components/business/cart';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { ShopTabs } from '@/components/business/shop-kit';
import { Note } from '@/components/ui';

/** Everything under here is a preview of the public storefront, seen from the Admin area. */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <DemoBanner />
      <PageHead title="Prévia da vitrine" subtitle="Como o cliente verá a página pública da escola." action={<CartLink />} />
      <ShopTabs active="/admin/business/lojinha/vitrine" />
      <Note tone="warning" title="Prévia, não publicada" className="mb-4">A página pública só existirá quando o banco multiempresa for aprovado. Nada aqui cobra, reserva ou baixa estoque.</Note>
      {children}
    </CartProvider>
  );
}
