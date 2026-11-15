import { Panel } from '@/components/admin/kit';
import { INSTRUCTOR_TABS, SectionTabs } from '@/components/business/company-kit';
import { ResponseForm } from '@/components/business/instructor-forms';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { EmptyState, Note } from '@/components/ui';
import { COMPANY, INVITATIONS } from '@/lib/business/demo';
import { dayLabel, unitName } from '@/lib/business/rules';
import { formatBps } from '@/lib/format';

export const metadata = { title: 'Aceitar ou recusar vínculo' };

export default function RespondInvitation() {
  const pending = INVITATIONS.filter((i) => i.status === 'pending');
  return (
    <>
      <DemoBanner />
      <PageHead title="Aceitar ou recusar vínculo" subtitle="Prévia da tela que o instrutor vê no próprio app ao receber um convite." />
      <SectionTabs label="Seções de instrutores" tabs={INSTRUCTOR_TABS} active="/admin/business/instrutores/vinculo" />
      <div className="grid gap-4">
        {pending.length === 0 ? <EmptyState>Nenhum convite pendente.</EmptyState> : pending.map((i) => (
          <Panel key={i.id} title={`Convite de ${COMPANY.name}`}>
            <p className="text-[13px] text-muted">Para {i.name} · enviado {dayLabel(i.createdOffset)}</p>
            <dl className="mt-2 grid gap-1.5 text-[13px]"><div className="flex justify-between gap-3"><dt className="text-muted">Unidades</dt><dd className="text-right text-ink">{i.unitIds.map(unitName).join(', ')}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">Comissão proposta</dt><dd className="tabular text-ink">{formatBps(i.commissionBps)}</dd></div></dl>
            <ResponseForm name={i.name} />
          </Panel>))}
        <Note title="O que a escola vê">Depois de aceitar, a escola vê só a sua disponibilidade e as aulas dela. Reservas de outras escolas aparecem apenas como “ocupado”, sem nenhum detalhe. Se a escola suspender o vínculo, você continua ativo no VentoKite e nas outras escolas.</Note>
      </div>
    </>
  );
}
