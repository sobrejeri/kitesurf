import type {Metadata} from 'next';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {PartnerHeading,PartnerFootnote} from '@/components/partner-info';
import {VerifiedVentoBadge} from '@/components/verified-badge';
import {Icon,type IconName} from '@/components/icon';
import {Badge,Card,ButtonLink} from '@/components/ui';
import {requireRole} from '@/lib/auth';
import {getOwnPartner,getPartnerSummary} from '@/lib/data';
import {formatMoney,formatBps} from '@/lib/format';

export const metadata:Metadata={title:'Central da pousada'};
const ACTIONS:{href:string;label:string;description:string;icon:IconName}[]=[
  {href:'/pousada/perfil',label:'Meu perfil',description:'Foto, endereço, responsável e dados de recebimento',icon:'user'},
  {href:'/pousada/divulgacao',label:'Meu link e QR',description:'Compartilhe as aulas com seus hóspedes',icon:'link'},
  {href:'/pousada/indicacoes',label:'Indicações e comissões',description:'Consulte contratos e valores contabilizados',icon:'chart'},
];

export default async function PartnerCentralPage(){
  const viewer=await requireRole(['partner'],'/pousada/central');
  if(viewer.role!=='partner')redirect('/admin/visao');
  const partner=await getOwnPartner(viewer.id);
  if(!partner)redirect('/pousada/cadastro');
  const summary=await getPartnerSummary();
  return <>
    <PartnerHeading title="Central da pousada" lead="Seu espaço para cuidar do cadastro, acompanhar indicações e divulgar as aulas."/>
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="min-w-0 break-words text-[18px] font-bold text-ink">{partner.name}</h2>
            <VerifiedVentoBadge kind="partner" status={partner.status} size="sm"/>
          </div>
          <p className="mt-1 text-[12px] text-muted">{partner.beach?.name??'Praia não informada'} · Código {partner.code}</p>
        </div>
        <Badge tone={partner.status==='approved'?'success':'warning'}>
          {partner.status==='approved'?'Aprovada':'Em análise'}
        </Badge>
      </div>
      {partner.status!=='approved' ? (
        <p className="mt-3 text-[12px] text-muted">
          Complete o perfil para a administração validar sua pousada e liberar o link de indicação.
          <Link href="/pousada/perfil" className="ml-1 font-semibold text-brand underline">Completar cadastro</Link>
        </p>
      ):null}
    </Card>
    <div className="grid grid-cols-2 gap-3">
      <Card className="!p-4">
        <p className="text-[12px] text-muted">Reservas indicadas</p>
        <p className="mt-2 text-[25px] font-bold tabular-nums text-ink">{summary.bookings}</p>
      </Card>
      <Card className="!p-4">
        <p className="text-[12px] text-muted">Comissão liberada</p>
        <p className="mt-2 text-[22px] font-bold tabular-nums text-ink">{formatMoney(summary.released_cents)}</p>
      </Card>
    </div>
    <h2 className="mb-3 mt-6 text-[19px] font-bold text-ink">O que deseja fazer?</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      {ACTIONS.map(action=>(
        <Link key={action.href} href={action.href}
          className="press flex items-start gap-3 rounded-[20px] border border-line bg-surface p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Icon name={action.icon} className="!h-5 !w-5"/>
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-[14px] text-ink">{action.label}</strong>
            <span className="mt-1 block text-[12px] leading-relaxed text-muted">{action.description}</span>
          </span>
          <Icon name="chevron" className="!h-4 !w-4 shrink-0 text-brand"/>
        </Link>
      ))}
    </div>
    <Card className="mt-4">
      <h2 className="text-[16px] font-bold">Seu programa de indicação</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        Comissão atual: {formatBps(partner.commission_bps)} sobre as aulas atribuídas à pousada.
        O código permanece o mesmo e os repasses automáticos ainda dependem de integração financeira.
      </p>
      <ButtonLink href="/pousada/divulgacao" variant="soft" size="sm" className="mt-4">Ver divulgação</ButtonLink>
    </Card>
    <PartnerFootnote/>
  </>;
}
