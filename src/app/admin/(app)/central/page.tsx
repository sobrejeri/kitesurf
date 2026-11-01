import type { Metadata } from 'next';

import { AdminTitle, QuickTile, type Tone } from '@/components/admin/kit';
import { type IconName } from '@/components/icon';
import { requireRole } from '@/lib/auth';

export const metadata: Metadata = { title: 'Mais opções' };

const OPTIONS: readonly { label: string; href: string; icon: IconName; tone: Tone }[] = [
  { label: 'Agenda de aulas', href: '/admin/agenda', icon: 'calendar', tone: 'blue' },
  { label: 'Criar aula teste', href: '/admin/aula-teste', icon: 'kite', tone: 'green' },
  { label: 'Fila e distribuição', href: '/admin/distribuicao', icon: 'list', tone: 'purple' },
  { label: 'Praias e localizações', href: '/admin/praias', icon: 'pin', tone: 'blue' },
  { label: 'Pousadas afiliadas', href: '/admin/afiliados', icon: 'home', tone: 'orange' },
  { label: 'Transporte de apoio', href: '/admin/transporte', icon: 'car', tone: 'blue' },
  { label: 'Regras da operação', href: '/admin/regras', icon: 'sliders', tone: 'purple' },
  { label: 'Analisar ocorrências', href: '/admin/ocorrencias', icon: 'wind', tone: 'orange' },
  { label: 'Documentos', href: '/admin/documentos', icon: 'file', tone: 'blue' },
  { label: 'Políticas comerciais', href: '/admin/politicas', icon: 'shield', tone: 'orange' },
  { label: 'Atendimento', href: '/admin/atendimento', icon: 'chat', tone: 'purple' },
  { label: 'Avisos da operação', href: '/admin/avisos', icon: 'bell', tone: 'purple' },
  { label: 'Configurações', href: '/admin/configuracoes', icon: 'settings', tone: 'green' },
];

export default async function AdminMorePage() {
  await requireRole(['admin'], '/admin/central');
  return (
    <>
      <AdminTitle title="Mais opções" subtitle="Tudo da operação em um só lugar." />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
        {OPTIONS.map((option) => (
          <QuickTile key={option.href} {...option} />
        ))}
      </div>
    </>
  );
}
