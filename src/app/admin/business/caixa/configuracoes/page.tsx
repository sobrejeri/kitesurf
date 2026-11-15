import { CashSettings } from '@/components/business/cash-forms';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { Note } from '@/components/ui';

export const metadata = { title: 'Configurações do caixa' };
export default function CashSettingsPage() {
  return (
    <>
      <DemoBanner />
      <PageHead title="Configurações do caixa" subtitle="Modo de fechamento e impressora de cada unidade." />
      <CashSettings />
      <Note className="mt-4" title="Sobre a impressão térmica">A impressão usa o diálogo de impressão do navegador, com o layout de 58 ou 80 mm. Impressão silenciosa e conexão direta por Bluetooth, USB ou ESC/POS dependem do navegador, do sistema e da impressora, e não estão ligadas.</Note>
    </>
  );
}
