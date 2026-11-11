import type {Metadata} from 'next';
import Link from 'next/link';
import {redirect} from 'next/navigation';

import {AffiliateProgramRules} from '@/components/affiliate/program-rules';
import {AdminTitle,HubSections} from '@/components/admin/kit';
import {VerifiedVentoBadge} from '@/components/verified-badge';
import {Badge,Card} from '@/components/ui';
import {AFFILIATE_NAV} from '@/components/workspace-nav';
import {requireRole} from '@/lib/auth';
import {getOwnPartner,getPartnerSummary} from '@/lib/data';
import {formatBps,formatMoney} from '@/lib/format';

export const metadata:Metadata={title:'Central do afiliado'};

export default async function AffiliateCentralPage(){
  const viewer=await requireRole(['partner'],'/afiliado/central');
  if(viewer.role!=='partner')redirect('/admin/visao');
  const partner=await getOwnPartner(viewer.id);
  if(!partner)redirect('/afiliado/cadastro');
  const summary=await getPartnerSummary();
  const titles=[...new Set(AFFILIATE_NAV.map(item=>item.group))];
  return <>
    <AdminTitle title="Central do afiliado" subtitle="Tudo do seu programa de indicação em um só lugar."/>
    <Card className="mb-5 !p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="min-w-0 break-words text-[18px] font-bold text-ink">{partner.name}</h2>
            <VerifiedVentoBadge kind="partner" status={partner.status} size="sm"/>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            Código {partner.code} · {formatBps(partner.commission_bps)} de comissão · {summary.bookings} reserva(s) · {formatMoney(summary.released_cents)} liberado
          </p>
        </div>
        <Badge tone={partner.status==='approved'?'success':'warning'}>
          {partner.status==='approved'?'Aprovado':'Em análise'}
        </Badge>
      </div>
      {partner.status!=='approved' ? (
        <p className="mt-3 text-[12.5px] text-muted">
          Complete o perfil para a equipe validar seu cadastro e liberar o link.{' '}
          <Link href="/afiliado/perfil" className="font-semibold text-brand underline">Completar cadastro</Link>
        </p>
      ):null}
    </Card>
    <HubSections sections={titles.map(title=>({
      title,
      items:AFFILIATE_NAV.filter(item=>item.group===title&&item.href!=='/afiliado/central'),
    }))}/>
    <AffiliateProgramRules className="mt-6"/>
  </>;
}
