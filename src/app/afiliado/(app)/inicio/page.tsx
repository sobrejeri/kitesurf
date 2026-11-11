import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AffiliateProgramRules } from '@/components/affiliate/program-rules';
import { CopyButton, ShareButton } from '@/components/affiliate/share-actions';
import { AdminTitle, Metric, Panel } from '@/components/admin/kit';
import { Icon } from '@/components/icon';
import { Note } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getOwnPartner, getPartnerSummary } from '@/lib/data';
import { formatBps, formatMoney } from '@/lib/format';
import { REFERRAL_SHARE_TEXT, referralLink } from '@/lib/referral';

export const metadata: Metadata = { title: 'Início do afiliado' };

const IDEAS = [
  { href: '/afiliado/divulgacao#mensagens', icon: 'chat', title: 'Mande no WhatsApp', body: 'Use a mensagem pronta com o seu link.' },
  { href: '/afiliado/divulgacao#qr-code', icon: 'download', title: 'Imprima o QR Code', body: 'Na recepção, no balcão ou no carro.' },
  { href: '/afiliado/divulgacao#mensagens', icon: 'image', title: 'Poste no Instagram', body: 'Legenda pronta para copiar.' },
] as const;

export default async function AffiliateHomePage() {
  const viewer = await requireRole(['partner'], '/afiliado/inicio');
  const partner = await getOwnPartner(viewer.id);
  if (!partner) redirect('/afiliado/cadastro');
  // An admin opening this area has no affiliate summary of their own.
  const summary = viewer.role === 'partner' ? await getPartnerSummary() : { bookings: 0, pending_cents: 0, released_cents: 0 };
  const approved = partner.status === 'approved';
  const link = referralLink(partner.code);
  const firstName = viewer.fullName.split(' ')[0] ?? '';

  return (
    <>
      <AdminTitle
        title={`Olá${firstName ? `, ${firstName}` : ''}`}
        subtitle={approved ? 'Seu link de indicação está ativo.' : 'Seu cadastro está em análise.'}
      />

      {!approved ? (
        <Note tone="warning" className="mb-4" title="Falta pouco para liberar seu link">
          Complete seu perfil para a equipe VentoKite aprovar o cadastro.{' '}
          <Link href="/afiliado/perfil" className="font-semibold underline">Completar perfil</Link>
        </Note>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <section className="vk-chrome vk-next-lesson relative overflow-hidden rounded-[16px] p-5 sm:p-6" aria-labelledby="link-indicacao">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#9fc0ff]">
            <span className={`h-2 w-2 rounded-full ${approved ? 'bg-[#baff06]' : 'bg-[#f5b544]'}`} aria-hidden="true" />
            Seu link de indicação
          </p>
          <h2 id="link-indicacao" className="mt-3 break-words text-[22px] font-bold leading-tight text-white sm:text-[24px]">{partner.name}</h2>
          <p className="mt-1 text-[13px] text-label">Código {partner.code}{partner.beach?.name ? ` · ${partner.beach.name}` : ''}</p>
          {approved ? (
            <>
              <p className="mt-4 truncate rounded-[12px] border border-line-ghost bg-[#ffffff0d] px-3.5 py-2.5 font-mono text-[12.5px] text-label">{link}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <CopyButton value={link} label="Copiar link" copiedLabel="Link copiado" />
                <ShareButton url={link} text={REFERRAL_SHARE_TEXT} onDark />
                <Link href="/afiliado/divulgacao" className="press inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-white hover:bg-[#ffffff12]">
                  QR Code e mensagens <Icon name="chevron" className="!h-4 !w-4" />
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-label">
              O link e o QR Code aparecem aqui assim que a equipe aprovar seu cadastro.
            </p>
          )}
        </section>

        <section className="flex flex-col justify-between rounded-[16px] border border-line bg-surface p-5 shadow-card">
          <div>
            <p className="text-[13px] font-medium text-muted">Sua comissão</p>
            <p className="tabular mt-1 text-[40px] font-bold leading-none tracking-[-1px] text-brand">{formatBps(partner.commission_bps)}</p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              sobre as aulas da primeira reserva de cada aluno que chegar pelo seu link.
            </p>
          </div>
          <Link href="/afiliado/indicacoes" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
            Ver minhas indicações <Icon name="chevron" className="!h-4 !w-4" />
          </Link>
        </section>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        <Metric label="Comissão liberada" value={formatMoney(summary.released_cents)} hint="Aulas realizadas" hintTone="success" icon="check" tone="green" />
        <Metric label="Comissão pendente" value={formatMoney(summary.pending_cents)} hint="Aguarda a aula acontecer" hintTone="brand" icon="clock" tone="sky" />
        <div className="col-span-2 lg:col-span-1">
          <Metric label="Reservas indicadas" value={String(summary.bookings)} hint="Feitas pelo seu link" icon="users" tone="blue" />
        </div>
      </div>

      {approved ? (
        <Panel title="Ideias para divulgar" className="mt-4">
          <ul className="grid gap-2.5 sm:grid-cols-3">
            {IDEAS.map((idea) => (
              <li key={idea.title}>
                <Link href={idea.href} className="press flex h-full items-start gap-3 rounded-[14px] border border-line bg-surface p-3.5 transition-colors hover:border-brand-focus">
                  <span className="vk-tone-blue grid h-10 w-10 shrink-0 place-items-center rounded-[11px]" aria-hidden="true">
                    <Icon name={idea.icon} className="!h-5 !w-5" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-[14px] font-semibold text-ink">{idea.title}</strong>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{idea.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <AffiliateProgramRules className="mt-4" />
    </>
  );
}
