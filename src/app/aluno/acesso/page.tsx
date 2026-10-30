import type { Metadata } from 'next';

import { AccessForm } from '@/components/student/access-form';
import { StudentHero } from '@/components/student/sunset';
import { Card, Note } from '@/components/ui';

export const metadata: Metadata = { title: 'Conta e acesso' };

export default function AccessPage() {
  return (
    <div>
      <StudentHero eyebrow="Seu espaço no kite" title="Conta e acesso" highlight="acesso" compact />
      <Note tone="warning" className="mb-5">
        Fluxo demonstrativo: não use credenciais reais. Nenhuma senha será armazenada.
      </Note>
      <Card>
        <AccessForm />
      </Card>
    </div>
  );
}
