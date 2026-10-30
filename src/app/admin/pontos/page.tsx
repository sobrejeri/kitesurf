import type { Metadata } from 'next';

import { DemoForm } from '@/components/interactive';
import { Button, Card, Field, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listActiveBeaches } from '@/lib/data';

export const metadata: Metadata = { title: 'Pontos de encontro' };

export default async function MeetingPointsPage() {
  await requireRole(['admin'], '/admin/pontos');
  const beaches = await listActiveBeaches();
  return (
    <>
      <PageHeader
        eyebrow="Encontro na praia"
        title="Pontos de encontro"
        lead="Defina a referência que aparecerá para o aluno. Os locais do protótipo precisam ser confirmados pela operação."
      />
      <DemoForm confirmation="Pontos de encontro salvos na demonstração." className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          {beaches.map((beach) => (
            <Card key={beach.id}>
              <h2 className="text-[16px]">{beach.name}</h2>
              <div className="mt-4 grid gap-4">
                <Field label="Referência do ponto de encontro"><input className={inputClass} /></Field>
                <Field label="Link do mapa confirmado pela operação"><input className={inputClass} type="url" placeholder="https://" /></Field>
              </div>
            </Card>
          ))}
        </div>
        <Button type="submit" className="justify-self-start">Salvar pontos de encontro</Button>
      </DemoForm>
    </>
  );
}
