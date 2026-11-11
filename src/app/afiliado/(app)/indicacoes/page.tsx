import type { Metadata } from 'next';

import { AffiliateProgramRules } from '@/components/affiliate/program-rules';
import { AdminTitle, Metric, Panel } from '@/components/admin/kit';
import { ButtonLink, EmptyState } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getPartnerSummary } from '@/lib/data';
import { formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Minhas indicações' };

const STEPS = [
  ['O aluno abre seu link', 'A indicação fica guardada por até 30 dias.'],
  ['Ele faz a primeira reserva', 'A comissão entra como pendente.'],
  ['A aula acontece', 'A comissão passa para liberada.'],
] as const;

/** Aggregates only: an affiliate never sees who the referred students are. */
export default async function ReferralsPage() {
  const viewer = await requireRole(['partner'], '/afiliado/indicacoes');
  const summary = viewer.role === 'partner' ? await getPartnerSummary() : null;
  const total = summary ? summary.pending_cents + summary.released_cents : 0;
  return (
    <>
      <AdminTitle title="Minhas indicações" subtitle="Totais das reservas feitas pelo seu link." />
      {!summary || summary.bookings === 0 ? (
        <EmptyState action={<ButtonLink href="/afiliado/divulgacao" size="sm" icon="link">Divulgar meu link</ButtonLink>}>
          Nenhuma reserva feita pelo seu link ainda. Compartilhe o link ou o QR Code para começar.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <Metric label="Reservas indicadas" value={String(summary.bookings)} hint="Feitas pelo seu link" icon="users" tone="blue" />
          <Metric label="Comissão pendente" value={formatMoney(summary.pending_cents)} hint="Aguarda a aula" hintTone="brand" icon="clock" tone="sky" />
          <Metric label="Comissão liberada" value={formatMoney(summary.released_cents)} hint="Aulas realizadas" hintTone="success" icon="check" tone="green" />
          <Metric label="Total gerado" value={formatMoney(total)} hint="Pendente + liberada" icon="wallet" tone="slate" />
        </div>
      )}

      <Panel title="Como sua comissão avança" className="mt-4">
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map(([title, body], index) => (
            <li key={title} className="flex gap-3">
              <span className="vk-tone-blue grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold" aria-hidden="true">{index + 1}</span>
              <span>
                <strong className="block text-[14px] font-semibold text-ink">{title}</strong>
                <span className="mt-0.5 block text-[12.5px] text-muted">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-line pt-3 text-[12px] text-muted">
          Para proteger os alunos, você vê só os totais, sem nomes ou contatos.
        </p>
      </Panel>

      <AffiliateProgramRules className="mt-4" />
    </>
  );
}
