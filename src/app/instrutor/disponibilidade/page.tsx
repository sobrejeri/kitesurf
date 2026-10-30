import type { Metadata } from 'next';

import { ChipChoice, DemoForm } from '@/components/interactive';
import { Button, ButtonLink, Card, Field, Note, PageHeader, inputClass } from '@/components/ui';
import { DEMO_PROFILES } from '@/data/demo';

export const metadata: Metadata = { title: 'Dias e turnos' };

export default function AvailabilityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Seu tempo de trabalho"
        title="Dias e turnos"
        lead="A busca respeita os turnos, os bloqueios e as aulas confirmadas."
      />
      <Card className="max-w-3xl">
        <div className="grid gap-2">
          <span className="text-[12px] font-medium text-label">Perfil de demonstração</span>
          <ChipChoice label="Perfil de demonstração" options={DEMO_PROFILES} defaultSelected={['Rafael']} />
        </div>
        <DemoForm confirmation="Disponibilidade salva na demonstração." className="mt-6 grid gap-5">
          <div className="grid gap-2">
            <span className="text-[12px] font-medium text-label">Dias em que você atende</span>
            <ChipChoice label="Dias em que você atende" multiple options={['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']} defaultSelected={['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Início do turno"><input type="time" defaultValue="08:00" className={inputClass} /></Field>
            <Field label="Fim do turno"><input type="time" defaultValue="17:00" className={inputClass} /></Field>
            <Field label="Intervalo entre aulas (min)"><input type="number" min={0} max={120} step={5} defaultValue={30} className={inputClass} /></Field>
          </div>
          <Note>Alterar turnos vale para novas solicitações. As aulas já confirmadas continuam na agenda.</Note>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Salvar disponibilidade</Button>
            <ButtonLink href="/instrutor/agenda" variant="ghost">Ver agenda e bloquear períodos</ButtonLink>
          </div>
        </DemoForm>
      </Card>
    </>
  );
}
