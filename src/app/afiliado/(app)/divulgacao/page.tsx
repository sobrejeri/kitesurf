import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AffiliateProgramRules } from '@/components/affiliate/program-rules';
import { ReferralQR } from '@/components/affiliate/referral-qr';
import { CopyButton, ShareButton } from '@/components/affiliate/share-actions';
import { AdminTitle, Panel } from '@/components/admin/kit';
import { Icon } from '@/components/icon';
import { Note } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getOwnPartner } from '@/lib/data';
import { formatBps } from '@/lib/format';
import { REFERRAL_SHARE_TEXT, referralLink, referralMessages } from '@/lib/referral';

export const metadata: Metadata = { title: 'Divulgar' };

export default async function PromotePage() {
  const viewer = await requireRole(['partner'], '/afiliado/divulgacao');
  const partner = await getOwnPartner(viewer.id);
  if (!partner) redirect('/afiliado/cadastro');
  const link = referralLink(partner.code);
  const approved = partner.status === 'approved';

  return (
    <>
      <AdminTitle title="Divulgar" subtitle={`Seu link, QR Code e mensagens prontas · ${formatBps(partner.commission_bps)} de comissão`} />

      {!approved ? (
        <Note tone="warning" title="Link liberado após a aprovação">
          O link, o QR Code e as mensagens aparecem aqui assim que a equipe VentoKite aprovar seu cadastro.{' '}
          <Link href="/afiliado/perfil" className="font-semibold underline">Conferir meu perfil</Link>
        </Note>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Panel title="Seu link" className="min-w-0">
              <p className="break-all rounded-[12px] border border-line-input bg-sand px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink">{link}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton value={link} label="Copiar link" copiedLabel="Link copiado" />
                <ShareButton url={link} text={REFERRAL_SHARE_TEXT} />
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                O link identifica sua indicação por até 30 dias. A comissão vale somente para a primeira
                reserva elegível do aluno; reservas seguintes não geram comissão.
              </p>
            </Panel>
            <section id="qr-code" className="min-w-0 scroll-mt-24">
              <Panel title="QR Code" className="h-full">
                <ReferralQR link={link} code={partner.code} />
                <p className="mt-3 text-center text-[12px] text-muted">Imprima e deixe na recepção, no balcão ou no carro.</p>
              </Panel>
            </section>
          </div>

          <section id="mensagens" className="mt-4 min-w-0 scroll-mt-24">
            <Panel title="Mensagens prontas">
              <ul className="grid gap-3 lg:grid-cols-3">
                {referralMessages(link).map((message) => (
                  <li key={message.id} className="flex min-w-0 flex-col rounded-[14px] border border-line bg-sand/50 p-4">
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                      <Icon name={message.icon} className="!h-4 !w-4 text-brand" /> {message.title}
                    </p>
                    <p className="mt-2 flex-1 break-words text-[13px] leading-relaxed text-label">{message.text}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <CopyButton value={message.text} label="Copiar texto" copiedLabel="Texto copiado" variant="ghost" />
                      {message.id === 'whatsapp' ? (
                        <a href={`https://wa.me/?text=${encodeURIComponent(message.text)}`} target="_blank" rel="noopener noreferrer"
                          className="press inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-brand hover:bg-brand-wash">
                          Abrir no WhatsApp <Icon name="arrow" className="!h-4 !w-4" />
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        </>
      )}

      <AffiliateProgramRules className="mt-4" />
    </>
  );
}
