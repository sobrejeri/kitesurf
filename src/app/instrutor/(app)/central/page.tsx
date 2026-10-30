import type { Metadata } from 'next';

import { Hub } from '@/components/shared';
import { DEMO_NOTICE } from '@/data/demo';

export const metadata: Metadata = { title: 'Central de trabalho' };

const ITEMS = [
  { title: 'Dias e turnos', body: 'Horários de trabalho e intervalo.', href: '/instrutor/disponibilidade' },
  { title: 'Agenda de aulas', body: 'Encontros e bloqueios.', href: '/instrutor/agenda' },
  { title: 'Meus documentos', body: 'Identificação, formação e estrutura.', href: '/instrutor/documentos' },
  { title: 'Ocorrências', body: 'Vento e registro de ausências.', href: '/instrutor/ocorrencias' },
  { title: 'Conversas', body: 'Converse sobre cada encontro.', href: '/instrutor/atendimento' },
  { title: 'Avisos', body: 'Solicitações e alterações.', href: '/instrutor/avisos' },
] as const;

export default function InstructorHubPage() {
  return <Hub title="Central de trabalho" items={ITEMS} notice={DEMO_NOTICE} />;
}
