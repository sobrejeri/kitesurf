import type { Metadata } from 'next';
import { IncidentWorkspace } from '@/components/incident-workspace';

export const metadata: Metadata = {title:'Ocorrências'};
export default async function IncidentsPage() {
  return <IncidentWorkspace area="instrutor"/>;
}
