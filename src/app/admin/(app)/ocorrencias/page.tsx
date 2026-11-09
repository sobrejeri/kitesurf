import type { Metadata } from 'next';
import { IncidentWorkspace } from '@/components/incident-workspace';

export const metadata: Metadata = {title:'Ocorrências'};
export default async function IncidentsPage({searchParams}: {
  searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const params=await searchParams;
  return <IncidentWorkspace area="admin" searchParams={params}/>;
}
