import type { Metadata } from 'next';

import { AccessForm } from '@/components/student/access-form';
import { Card, Note, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Conta e acesso' };

export default function AccessPage() {
  return (
    <div className="max-w-lg">
      <PageHeader eyebrow="Seu espaço no kite" title="Conta e acesso" />
      <Note tone="warning" className="mb-5">
        Fluxo demonstrativo: não use credenciais reais. Nenhuma senha será armazenada.
      </Note>
      <Card>
        <AccessForm />
      </Card>
    </div>
  );
}
