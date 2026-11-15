import { Panel } from '@/components/admin/kit';
import { AffiliateTabs } from '@/components/business/affiliate-kit';
import { DecisionForm } from '@/components/business/affiliate-forms';
import { DemoBanner, PageHead } from '@/components/business/kit';
import { Badge, EmptyState } from '@/components/ui';
import { AFFILIATE_REQUESTS } from '@/lib/business/demo';
import { dayLabel } from '@/lib/business/rules';

export const metadata = { title: 'Solicitações de afiliação' };
const KIND = { pousada: 'Pousada', loja: 'Loja', influenciador: 'Influenciador' } as const;

export default function RequestsPage() {
  const pending = AFFILIATE_REQUESTS.filter((r) => r.status === 'pending'); const decided = AFFILIATE_REQUESTS.filter((r) => r.status !== 'pending');
  return (
    <>
      <DemoBanner />
      <PageHead title="Solicitações de afiliação" subtitle="Quem pediu para divulgar a escola. Recusar exige motivo." />
      <AffiliateTabs active="/admin/business/afiliados/solicitacoes" />
      <div className="grid gap-4">
        {pending.length === 0 ? <EmptyState>Nenhuma solicitação pendente.</EmptyState> : pending.map((r) => (
          <Panel key={r.id} title={`${r.name} · ${KIND[r.kind]}`}>
            <p className="text-[13px] text-muted">{r.city} · pediu {dayLabel(r.createdOffset)}</p><p className="mt-1 text-[14px] text-ink">{r.message}</p>
            <DecisionForm name={r.name} />
          </Panel>))}
        <Panel title="Já decididas">
          <ul className="divide-y divide-line text-[13px]">{decided.map((r) => <li key={r.id} className="flex items-start justify-between gap-3 py-2.5"><span><strong className="text-ink">{r.name}</strong> <span className="text-muted">· {r.city}{r.reason ? ` · ${r.reason}` : ''}</span></span>{r.status === 'approved' ? <Badge tone="success">Aprovada</Badge> : <Badge tone="danger">Recusada</Badge>}</li>)}</ul>
        </Panel>
      </div>
    </>
  );
}
