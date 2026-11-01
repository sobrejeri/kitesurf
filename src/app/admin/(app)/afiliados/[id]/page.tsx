import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';

import {approvePartner} from '@/app/actions/admin';
import {ActionForm} from '@/components/action-form';
import {AdminTitle} from '@/components/admin/kit';
import {Icon} from '@/components/icon';
import {Badge,ButtonLink,Card,Note,inputClass} from '@/components/ui';
import {requireRole} from '@/lib/auth';
import {listAllPartners,listAllBookings} from '@/lib/data';
import {formatBps,formatMoney} from '@/lib/format';
import {PARTNER_REQUIRED,PARTNER_OPTIONAL,parsePartnerProgress,partnerCompletion} from '@/lib/partner-progress';
import {createSupabaseServerClient} from '@/lib/supabase/server';

export const metadata:Metadata={title:'Analisar pousada'};
type AdminData={
  responsible_name:string;phone:string;city:string;address:string;instagram:string;
  avatar_path:string|null;
};
function parseAdminData(v:unknown):AdminData|null {
  if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const d=v as Record<string,unknown>;
  const fields=['responsible_name','phone','city','address','instagram'];
  if(!fields.every(k=>typeof d[k]==='string'))return null;
  return d as AdminData;
}

export default async function PartnerReviewPage({
  params,
}:{params:Promise<{id:string}>}){
  await requireRole(['admin'],'/admin/afiliados');
  const {id}=await params;
  const partners=await listAllPartners();
  const partner=partners.find(p=>p.id===id);
  if(!partner)notFound();

  const db=await createSupabaseServerClient();
  const [progressResult,contactResult,bookings]=await Promise.all([
    db.rpc('get_partner_profile_progress',{p_partner_id:id}),
    db.rpc('get_partner_admin_details',{p_partner_id:id}),
    listAllBookings(500),
  ]);
  const flags=parsePartnerProgress(progressResult.data);
  const completion=partnerCompletion(flags);
  const contact=parseAdminData(contactResult.data);
  let photoUrl:string|null=null;
  if(contact?.avatar_path){
    const url=await db.storage.from('vento-partner-avatars').createSignedUrl(contact.avatar_path,3600);
    photoUrl=url.data?.signedUrl??null;
  }
  const theirs=bookings.filter(b=>b.partner_id===partner.id&&!b.is_test&&b.status!=='cancelled');
  const commission=theirs.reduce((sum,b)=>sum+b.partner_cents,0);
  const ready=completion.ready&&Boolean(contact)&&!progressResult.error;
  return <>
    <div className="mb-4">
      <ButtonLink href="/admin/afiliados" variant="ghost" size="sm" icon="back">Todas as pousadas</ButtonLink>
    </div>
    <AdminTitle title={partner.name} subtitle="Validação de pousada parceira" />

    <Card className="mb-4">
      <div className="flex flex-wrap items-center gap-4">
        {photoUrl?(
          <img src={photoUrl} alt={'Logo da '+partner.name}
            className="h-20 w-20 shrink-0 rounded-[18px] border border-line object-cover"/>
        ):(
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-[18px] bg-brand-soft text-brand">
            <Icon name="home" className="!h-8 !w-8"/>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <strong className="block break-words text-[19px] text-ink">{partner.name}</strong>
          <p className="mt-1 text-[12px] text-muted">{partner.beach?.name??'Praia não informada'} · {partner.code}</p>
          <div className="mt-2"><Badge tone={partner.status==='approved'?'success':'warning'}>
            {partner.status==='approved'?'Aprovada':'Em análise'}
          </Badge></div>
        </div>
      </div>
      <p className="mt-4 text-[12px] text-muted">
        {theirs.length} reserva(s) válida(s) · {formatMoney(commission)} em comissão estimada · {formatBps(partner.commission_bps)}
      </p>
    </Card>

    {progressResult.error||contactResult.error?(
      <Note tone="warning" className="mb-4">
        Não foi possível consultar os dados privados ou o progresso cadastral.
        Confira se a migração 22 está aplicada no Supabase. Não aprove antes de verificar o cadastro.
      </Note>
    ):null}

    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-bold text-ink">Conferência do cadastro</h2>
        <strong className="text-[20px] text-brand">{completion.percentage===null?'—':completion.percentage+'%'}</strong>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-sand">
        <div className="h-full rounded-full bg-brand"
          style={{width:(completion.percentage??0)+'%'}}/>
      </div>
      <p className="mt-2 text-[12px] text-muted">
        {completion.requiredDone} de {PARTNER_REQUIRED.length} campos essenciais preenchidos.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {[...PARTNER_REQUIRED,...PARTNER_OPTIONAL].map(item=>(
          <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5 text-[12px]">
            <span className="text-ink">{item.label}</span>
            <Badge tone={flags===null?'quiet':flags[item.key]?'success':'warning'}>
              {flags===null?'Não verificado':flags[item.key]?'Preenchido':'Pendente'}
            </Badge>
          </div>
        ))}
      </div>
    </Card>

    <Card className="mb-4">
      <h2 className="text-[18px] font-bold text-ink">Informações para conferência</h2>
      <p className="mt-1 text-[12px] text-muted">
        Dados de contato visíveis somente para a administração. Dados bancários continuam privados.
      </p>
      <dl className="mt-3 divide-y divide-line text-[13px]">
        {([
          ['Responsável',contact?.responsible_name],
          ['Telefone / WhatsApp',contact?.phone],
          ['Cidade',contact?.city],
          ['Endereço',contact?.address],
          ['Instagram',contact?.instagram],
        ] as const).map(([label,value])=>(
          <div key={label} className="flex flex-wrap justify-between gap-2 py-3">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 max-w-full break-words text-ink">{value||'Não informado'}</dd>
          </div>
        ))}
      </dl>
    </Card>

    {partner.status==='pending'?(
      <Card>
        <h2 className="text-[18px] font-bold text-ink">Analisar cadastro</h2>
        {ready?(
          <ActionForm action={approvePartner} submitLabel="Aprovar pousada"
            className="mt-3 grid gap-3">
            <input type="hidden" name="partnerId" value={partner.id}/>
            <label className="text-[13px] font-semibold text-ink" htmlFor="partner-reason">Motivo da aprovação</label>
            <input id="partner-reason" name="reason" required minLength={3} maxLength={500}
              placeholder="Ex.: dados de contato conferidos" className={inputClass}/>
          </ActionForm>
        ):(
          <Note tone="warning" className="mt-3" title="Aprovação pendente">
            A pousada precisa preencher o responsável, telefone, cidade e endereço.
            Esses dados serão avaliados pela administração antes da liberação do link.
          </Note>
        )}
      </Card>
    ):(
      <Note title="Pousada aprovada">
        O link de indicação está liberado. Alterações no nome ou praia exigem revisão administrativa.
      </Note>
    )}
  </>;
}
