import type {Metadata} from 'next';
import Link from 'next/link';

import {AdminTitle} from '@/components/admin/kit';
import {AdminProfilePhoto} from '@/components/admin/profile-photo';
import {Icon} from '@/components/icon';
import {Badge,EmptyState,Note} from '@/components/ui';
import {requireRole} from '@/lib/auth';
import {getAdminAvatarUrls} from '@/lib/admin-avatars';
import {VerifiedVentoBadge} from '@/components/verified-badge';
import {listAllBookings,listAllPartners} from '@/lib/data';
import {formatBps,formatMoney} from '@/lib/format';
import {parsePartnerProgress,partnerCompletion} from '@/lib/partner-progress';
import {initials} from '@/lib/people';
import {createSupabaseServerClient} from '@/lib/supabase/server';

export const metadata:Metadata={title:'Afiliados'};

export default async function PartnersAdminPage(){
  await requireRole(['admin'],'/admin/afiliados');
  const [partners,bookings,avatarUrls]=await Promise.all([
    listAllPartners(),listAllBookings(500),getAdminAvatarUrls('partner'),
  ]);
  const db=await createSupabaseServerClient();
  const states=await Promise.all(partners.map(async partner=>{
    const result=await db.rpc('get_partner_profile_progress',{p_partner_id:partner.id});
    return {id:partner.id,completion:partnerCompletion(parsePartnerProgress(result.data))};
  }));
  const progressById=new Map(states.map(item=>[item.id,item.completion]));
  const pending=partners.filter(partner=>partner.status==='pending').length;
  const approved=partners.filter(partner=>partner.status==='approved').length;
  const stats=(partnerId:string)=>{
    const theirs=bookings.filter(b=>b.partner_id===partnerId&&!b.is_test&&b.status!=='cancelled');
    return {count:theirs.length,commission:theirs.reduce((sum,b)=>sum+b.partner_cents,0)};
  };
  return <>
    <AdminTitle title="Afiliados"
      subtitle={`${partners.length} cadastrado(s) · ${pending} em análise · ${approved} aprovado(s)`}/>
    {partners.length===0?(
      <EmptyState>Nenhum afiliado cadastrado. Afiliados criam conta em /afiliado/criar-conta.</EmptyState>
    ):(
      <ul className="grid gap-3 lg:grid-cols-2">
        {partners.map(partner=>{
          const {count,commission}=stats(partner.id);
          const completion=progressById.get(partner.id);
          return <li key={partner.id} className="overflow-hidden rounded-[18px] border border-line bg-surface">
            <Link href={`/admin/afiliados/${partner.id}`} aria-label={`Analisar afiliado ${partner.name}`}
              className="press block p-4">
              <div className="flex items-start gap-3">
                <AdminProfilePhoto
                  src={avatarUrls.get(partner.id)}
                  name={partner.name}
                  initials={initials(partner.name)}
                  kind="partner"
                  size={64}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <h2 className="min-w-0 break-words text-[16px] font-bold text-ink">{partner.name}</h2>
                      <VerifiedVentoBadge kind="partner" status={partner.status} size="sm"/>
                    </div>
                    <Badge tone={partner.status==='approved'?'success':'warning'}>
                      {partner.status==='approved'?'Aprovado':'Em análise'}
                    </Badge>
                  </div>
                  <p className="mt-1 break-words text-[12px] text-muted">
                    {partner.beach?.name??'Praia não informada'} · {partner.code}
                  </p>
                  <p className="mt-1.5 text-[12px] text-label">
                    {count} reserva(s) · {formatMoney(commission)} em comissão · {formatBps(partner.commission_bps)}
                  </p>
                </div>
                <Icon name="chevron" className="mt-2 !h-5 !w-5 shrink-0 text-muted"/>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <span className="text-[12px] text-muted">Verificação cadastral</span>
                <Badge tone={!completion||completion.percentage===null?'quiet':completion.ready?'success':'warning'}>
                  {!completion||completion.percentage===null?'Não verificado':completion.percentage+'% preenchido'}
                </Badge>
              </div>
              {partner.status==='pending'?(
                <p className="mt-2 text-[12px] font-semibold text-brand">Abrir cadastro para analisar e aprovar</p>
              ):null}
            </Link>
          </li>;
        })}
      </ul>
    )}
    <Note className="mt-4" title="Como funciona a aprovação">
      O afiliado precisa preencher os dados essenciais antes da aprovação. Foto, Instagram
      e dados bancários são opcionais. A comissão continua saindo da parcela da plataforma.
    </Note>
  </>;
}
