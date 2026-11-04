import type { Metadata } from 'next';

import { IncidentWorkspace } from '@/components/incident-workspace';
import { Note } from '@/components/ui';

export const metadata: Metadata = { title: 'Atendimento' };

export default function AdminChatPage() {
  return <>
    <Note className="mb-4">Atendimentos e resoluções são registrados por ocorrência. As conversas da aula continuam privadas entre aluno e instrutor.</Note>
    <IncidentWorkspace area="admin" title="Atendimento da operação" />
  </>;
}
