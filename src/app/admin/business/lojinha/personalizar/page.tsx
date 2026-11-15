import { DemoBanner, PageHead } from '@/components/business/kit';
import { StoreForm } from '@/components/business/cart';
import { ShopTabs } from '@/components/business/shop-kit';

export const metadata = { title: 'Personalização da loja' };

export default function CustomizePage() {
  return (
    <>
      <DemoBanner />
      <PageHead title="Personalização da loja" subtitle="Nome, frase, contato e cor de destaque da vitrine." />
      <ShopTabs active="/admin/business/lojinha/personalizar" />
      <StoreForm />
    </>
  );
}
