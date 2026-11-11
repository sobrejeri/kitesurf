import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { signOut } from '@/app/actions/auth';
import { savePartnerPayout, savePartnerProfile } from '@/app/actions/partner-profile';
import { ActionForm } from '@/components/action-form';
import { AdminTitle, Panel } from '@/components/admin/kit';
import { Icon } from '@/components/icon';
import { VerifiedVentoBadge } from '@/components/verified-badge';
import { PartnerPayoutFields } from '@/components/partner/payout-fields';
import { PartnerAvatarUploader } from '@/components/partner/avatar-uploader';
import { Badge, Card, Note, Field, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getOwnPartner, listActiveBeaches } from '@/lib/data';
import {
  PARTNER_OPTIONAL, PARTNER_REQUIRED, partnerCompletion, type PartnerProgress,
} from '@/lib/partner-progress';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata:Metadata={title:'Meu perfil · Afiliado'};

type PrivateData={
  responsible_name:string;phone:string;city:string;address:string;
  instagram:string;avatar_path:string|null;
};
type Payout={
  method:'pix'|'bank';holder_name:string;pix_key:string|null;bank_name:string|null;
  branch:string|null;account_number:string|null;account_type:'checking'|'savings'|null;
};

function SectionSummary({icon,title,hint}:{icon:'user'|'wallet';title:string;hint:string}) {
  return (
    <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
      <span className="vk-tone-blue grid h-10 w-10 shrink-0 place-items-center rounded-[11px]" aria-hidden="true">
        <Icon name={icon} className="!h-5 !w-5"/>
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[16px] font-semibold text-ink">{title}</strong>
        <span className="block text-[12.5px] text-muted">{hint}</span>
      </span>
      <Icon name="chevronDown" className="!h-5 !w-5 shrink-0 text-muted transition-transform group-open:rotate-180"/>
    </summary>
  );
}

export default async function AffiliateProfilePage(){
  const viewer=await requireRole(['partner'],'/afiliado/perfil');
  if(viewer.role!=='partner')redirect('/admin/visao');
  const [partner,beaches]=await Promise.all([
    getOwnPartner(viewer.id),listActiveBeaches(),
  ]);
  if(!partner)redirect('/afiliado/cadastro');
  const db=await createSupabaseServerClient();
  const [details,payout]=await Promise.all([
    db.from('partner_private_profiles').select(
      'responsible_name,phone,city,address,instagram,avatar_path'
    ).eq('id',viewer.id).maybeSingle<PrivateData>(),
    db.from('partner_payout_details').select(
      'method,holder_name,pix_key,bank_name,branch,account_number,account_type'
    ).eq('id',viewer.id).maybeSingle<Payout>(),
  ]);
  const ready=!details.error&&!payout.error;
  const d=details.data;
  const flags:PartnerProgress|null=ready?{
    name:partner.name.trim().length>=2,
    beach:Boolean(partner.beach_id),
    responsible:(d?.responsible_name??'').trim().length>=2,
    phone:(d?.phone??'').trim().length>=8,
    city:(d?.city??'').trim().length>=2,
    address:(d?.address??'').trim().length>=5,
    instagram:Boolean(d?.instagram?.trim()),
    avatar:Boolean(d?.avatar_path),
    payout:Boolean(payout.data),
  }:null;
  const progress=partnerCompletion(flags);
  let photoUrl:string|null=null;
  if(d?.avatar_path){
    const signed=await db.storage.from('vento-partner-avatars')
      .createSignedUrl(d.avatar_path,3600);
    photoUrl=signed.data?.signedUrl??null;
  }
  const isApproved=partner.status==='approved';
  return <>
    <AdminTitle title="Meu perfil" subtitle="Seus dados, foto e conta para receber as comissões."/>

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="!p-5">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
          <PartnerAvatarUploader photoUrl={photoUrl} name={partner.name} enabled={ready}/>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-center gap-1.5 sm:justify-start">
              <h2 className="min-w-0 break-words text-[20px] font-bold text-ink">{partner.name}</h2>
              <VerifiedVentoBadge kind="partner" status={partner.status} size="lg"/>
            </div>
            <p className="mt-1 text-[12.5px] text-muted">Afiliado VentoKite · {partner.beach?.name??'Praia não informada'}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Badge tone={isApproved?'success':'warning'}>{isApproved?'Aprovado':'Cadastro em análise'}</Badge>
              <Badge tone="quiet">Código {partner.code}</Badge>
            </div>
          </div>
        </div>
      </Card>

      <Card className="!p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-muted">Cadastro</p>
            <p className="mt-1 text-[15px] font-semibold text-ink">
              {progress.ready ? 'Dados essenciais completos' : `${progress.requiredDone} de ${PARTNER_REQUIRED.length} dados essenciais`}
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {progress.ready ? 'A aprovação depende da análise da equipe.' : 'Complete para a equipe liberar seu link.'}
            </p>
          </div>
          <strong className="tabular shrink-0 text-[26px] font-bold leading-none text-brand">{progress.percentage===null?'—':`${progress.percentage}%`}</strong>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-track" role="progressbar"
          aria-label="Preenchimento do perfil" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={progress.percentage??0}>
          <div className="h-full rounded-full bg-brand" style={{width:`${progress.percentage??0}%`}}/>
        </div>
        <details className="group mt-3" open={!progress.ready}>
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            O que falta
            <Icon name="chevronDown" className="!h-4 !w-4 text-muted transition-transform group-open:rotate-180"/>
          </summary>
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {[...PARTNER_REQUIRED,...PARTNER_OPTIONAL].map(item=>{
              const filled=flags?.[item.key];
              return <li key={item.key} className="flex items-center justify-between gap-2 border-b border-line py-2 text-[12.5px]">
                <span className="min-w-0 break-words text-ink">{item.label}</span>
                <Badge tone={flags===null?'quiet':filled?'success':'warning'}>
                  {flags===null?'Não verificado':filled?'Preenchido':'Pendente'}
                </Badge>
              </li>;
            })}
          </ul>
        </details>
      </Card>
    </div>

    {!ready?<Note tone="warning" title="Ativação pendente" className="mt-4">
      As informações completas e a foto dependem da migração 22 do Supabase.
      Suas indicações continuam disponíveis normalmente.
    </Note>:null}

    <div className="mt-4 grid gap-4">
      <Panel>
        <details className="group" open={!progress.ready}>
          <SectionSummary icon="user" title="Dados do afiliado"
            hint={isApproved?'Nome e praia são alterados pela equipe após a aprovação.':'Quem você é e como falar com você.'}/>
          <ActionForm action={savePartnerProfile} submitLabel="Salvar dados"
            className="mt-4 grid gap-3 sm:grid-cols-2" submitClassName="sm:col-span-2">
            <Field label="Nome do afiliado ou da empresa">
              <input name="name" required minLength={2} maxLength={120}
                defaultValue={partner.name} readOnly={isApproved}
                className={inputClass}/>
            </Field>
            <Field label="Praia onde você atua">
              <select name="beachId" required defaultValue={partner.beach_id}
                disabled={isApproved} className={inputClass}>
                {!beaches.some(b=>b.id===partner.beach_id)?(
                  <option value={partner.beach_id}>{partner.beach?.name??'Praia atual'}</option>
                ):null}
                {beaches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            {isApproved?<input type="hidden" name="beachId" value={partner.beach_id}/>:null}
            <Field label="Nome do responsável">
              <input name="responsibleName" required minLength={2} maxLength={120}
                defaultValue={d?.responsible_name??''} className={inputClass}/>
            </Field>
            <Field label="Telefone / WhatsApp">
              <input name="phone" type="tel" required minLength={8} maxLength={20}
                defaultValue={d?.phone??''} placeholder="(88) 99999-9999" className={inputClass}/>
            </Field>
            <Field label="Cidade">
              <input name="city" required minLength={2} maxLength={80}
                defaultValue={d?.city??''} placeholder="Jijoca de Jericoacoara" className={inputClass}/>
            </Field>
            <Field label="Endereço comercial ou de contato">
              <input name="address" required minLength={5} maxLength={200}
                defaultValue={d?.address??''} placeholder="Rua, número e referência" className={inputClass}/>
            </Field>
            <Field label="Instagram (opcional)">
              <input name="instagram" maxLength={80}
                defaultValue={d?.instagram??''} placeholder="@seuperfil" className={inputClass}/>
            </Field>
          </ActionForm>
        </details>
      </Panel>

      <Panel>
        <details className="group">
          <SectionSummary icon="wallet" title="Recebimento"
            hint={payout.data?`${payout.data.method==='pix'?'Pix':'Conta bancária'} cadastrado · privado`:'Para os repasses futuros das comissões.'}/>
          <p className="mt-3 text-[12.5px] text-muted">
            Seus dados bancários são privados e não ativam pagamentos automáticos.
          </p>
          <ActionForm action={savePartnerPayout} submitLabel="Salvar recebimento"
            className="mt-3 grid gap-3">
            <PartnerPayoutFields saved={payout.data??null}/>
          </ActionForm>
        </details>
      </Panel>

      <Panel title="Conta">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 break-all text-[13px] text-label">
            <Icon name="mail" className="mr-1.5 inline !h-4 !w-4 align-[-3px] text-muted"/>
            {viewer.email??'E-mail não informado'}
          </p>
          <form action={signOut}>
            <button type="submit" className="press inline-flex min-h-10 items-center gap-2 rounded-full border border-line-ghost px-4 text-[13px] font-semibold text-danger hover:bg-danger-soft">
              <Icon name="logout" className="!h-4 !w-4"/> Sair da conta
            </button>
          </form>
        </div>
      </Panel>
    </div>
  </>;
}
