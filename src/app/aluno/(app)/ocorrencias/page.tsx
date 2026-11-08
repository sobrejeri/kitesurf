import type { Metadata } from 'next';
import { DesktopPageHeader } from '@/components/student/desktop-page-header';
import { IncidentWorkspace } from '@/components/incident-workspace';

export const metadata: Metadata = {title:'Ocorrências'};
export default async function IncidentsPage() {
  return <div className="vento-pc-secondary-page vento-pc-incidents-screen">
    <DesktopPageHeader eyebrow="SUPORTE ÀS AULAS" title="Imprevistos e ocorrências" lead="Registre um imprevisto e acompanhe o andamento da sua solicitação." icon="shield" backHref="/aluno/central" variant="coast"/>
    <div className="vento-pc-secondary-main"><IncidentWorkspace area="aluno"/></div>
  </div>;
}
