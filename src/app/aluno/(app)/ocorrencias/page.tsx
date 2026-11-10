import type { Metadata } from 'next';
import { DesktopPageHeader } from '@/components/student/desktop-page-header';
import { IncidentWorkspace } from '@/components/incident-workspace';

export const metadata: Metadata = {title:'Ocorrências'};
export default async function IncidentsPage({searchParams}: {
  searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const params=await searchParams;
  return <div className="vento-pc-secondary-page vento-pc-incidents-screen vento-mobile-appbar-clearance">
    <DesktopPageHeader eyebrow="VENTOKITE PROTEGE" title="Imprevistos e ocorrências" lead="Registre um imprevisto e acompanhe o andamento da sua solicitação." icon="shield" backHref="/aluno/central" variant="coast"/>
    <div className="vento-pc-secondary-main"><IncidentWorkspace area="aluno" searchParams={params}/></div>
  </div>;
}
