import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Panel } from '@/components/admin/kit';
import { STAFF_TABS, SectionTabs } from '@/components/business/company-kit';
import { DemoBanner, PageHead, RoleBadge } from '@/components/business/kit';
import { Badge, EmptyState } from '@/components/ui';
import { AUDIT_LABEL, AUDIT_LOG, PERMISSIONS, PERMISSION_OVERRIDES, ROLE_PERMISSIONS } from '@/lib/business/demo';
import { agoLabel, effectivePermissions, employeeById } from '@/lib/business/company';
import { unitName } from '@/lib/business/rules';

export const metadata = { title: 'Perfil do funcionário' };

export default async function EmployeeProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const e = employeeById(id); if (!e) notFound();
  const log = AUDIT_LOG.filter((a) => a.actorId === e.id || a.target === e.name).sort((a, b) => a.minutesAgo - b.minutesAgo);
  return (
    <>
      <DemoBanner />
      <PageHead title={e.name} subtitle={e.email} />
      <SectionTabs label="Seções da equipe" tabs={STAFF_TABS} active="/admin/business/funcionarios" />
      <div className="grid gap-4">
        {e.assignments.map((a) => {
          const eff = effectivePermissions(e, a.unitId); const o = PERMISSION_OVERRIDES.find((x) => x.employeeId === e.id && x.unitId === a.unitId);
          return (
            <Panel key={a.unitId} title={unitName(a.unitId)} action={<RoleBadge role={a.role} />}>
              <p className="mb-2 text-[12.5px] text-muted">{eff.length} de {PERMISSIONS.length} permissões nesta unidade{o ? ' (com exceções)' : ''}.</p>
              <ul className="flex flex-wrap gap-1.5">{PERMISSIONS.map((p) => { const on = eff.includes(p.id); const extra = on && !ROLE_PERMISSIONS[a.role].includes(p.id); const cut = !on && ROLE_PERMISSIONS[a.role].includes(p.id);
                return <li key={p.id}><Badge tone={extra ? 'brand' : on ? 'success' : cut ? 'danger' : 'quiet'}>{p.label}{extra ? ' (extra)' : cut ? ' (retirada)' : on ? '' : ' — não'}</Badge></li>; })}</ul>
            </Panel>);
        })}
        <Panel title="Ações recentes">{log.length === 0 ? <EmptyState>Sem ações registradas.</EmptyState> : <ul className="divide-y divide-line text-[13px]">{log.map((a) => <li key={a.id} className="py-2.5"><strong className="text-ink">{AUDIT_LABEL[a.action]}</strong> <span className="text-muted">· {agoLabel(a.minutesAgo)} · {a.detail}</span></li>)}</ul>}</Panel>
        <p className="text-[12.5px]"><Link href="/admin/business/auditoria" className="font-semibold text-brand">Ver toda a auditoria</Link></p>
      </div>
    </>
  );
}
