import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { signOut } from '@/app/actions/auth';
import { savePartnerPayout, savePartnerProfile, uploadPartnerAvatar } from '@/app/actions/partner-profile';
import { ActionForm } from '@/components/action-form';
import { Icon } from '@/components/icon';
import { PartnerFootnote, PartnerHeading } from '@/components/partner-info';
import { VerifiedVentoBadge } from '@/components/verified-badge';
import { PartnerPayoutFields } from '@/components/partner/payout-fields';
import { ProfilePhotoPicker } from '@/components/profile-photo-picker';
import { Badge, ButtonLink, Card, Note, Field, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getOwnPartner, listActiveBeaches } from '@/lib/data';
import {
  PARTNER_OPTIONAL, PARTNER_REQUIRED, partnerCompletion, type PartnerProgress,
} from '@/lib/partner-progress';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata:Metadata={title:'Meu perfil · Pousada'};

type PrivateData={
  responsible_name:string;phone:string;city:string;address:string;
  instagram:string;avatar_path:string|null;
};
type Payout={
  method:'pix'|'bank';holder_name:string;pix_key:string|null;bank_name:string|null;
  branch:string|null;account_number:string|null;account_type:'checking'|'savings'|null;
};

export default async function PartnerProfilePage(){
  const viewer=await requireRole(['partner'],'/pousada/perfil');
  if(viewer.role!=='partner')redirect('/admin/visao');
  const [partner,beaches]=await Promise.all([
    getOwnPartner(viewer.id),listActiveBeaches(),
  ]);
  if(!partner)redirect('/pousada/cadastro');
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
    <PartnerHeading title="Meu perfil" lead="Gerencie sua pousada, contatos, foto e dados de recebimento." />
    <Card className="mb-4">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
        <ProfilePhotoPicker
          action={uploadPartnerAvatar} photoUrl={photoUrl} name={partner.name}
          enabled={ready}/>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-center gap-1.5 sm:justify-start">
            <h2 className="min-w-0 break-words text-[22px] font-bold text-ink">{partner.name}</h2>
            <VerifiedVentoBadge kind="partner" status={partner.status} size="lg"/>
          </div>
          <p className="mt-1 text-[12px] text-muted">{partner.beach?.name??'Praia não informada'} · Pousada parceira</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <Badge tone={isApproved?'success':'warning'}>
              {isApproved?'Aprovada pela administração':'Cadastro em análise'}
            </Badge>
            {isApproved?<Badge tone="brand">Parceira verificada Vento</Badge>:null}
          </div>
          <p className="mt-2 break-all text-[12px] text-muted">Código de indicação: {partner.code}</p>
          <p className="mt-1 text-[11px] text-muted">Toque no + para adicionar ou trocar sua foto/logo.</p>
        </div>
      </div>
    </Card>

    <Card className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[1.2px] text-brand">Verificação cadastral</p>
          <h2 className="mt-1 text-[18px] font-bold text-ink">Seu cadastro está completo?</h2>
          <p className="mt-1 text-[12px] text-muted">
            {progress.ready
              ? 'Dados essenciais completos. A aprovação depende da análise do Admin.'
              : `${progress.requiredDone} de ${PARTNER_REQUIRED.length} dados obrigatórios preenchidos`}
          </p>
        </div>
        <strong className="shrink-0 text-[21px] font-bold text-brand">{progress.percentage===null?'—':`${progress.percentage}%`}</strong>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-sand" role="progressbar"
        aria-label="Preenchimento do perfil" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={progress.percentage??0}>
        <div className="h-full rounded-full bg-brand" style={{width:`${progress.percentage??0}%`}}/>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Inclui {PARTNER_REQUIRED.length} informações essenciais e {PARTNER_OPTIONAL.length} complementares.
      </p>
      <details className="group mt-4" open={!progress.ready}>
        <summary className="flex cursor-pointer list-none items-center justify-between border-t border-line pt-3 text-[13px] font-bold text-ink [&::-webkit-details-marker]:hidden">
          Conferir informações preenchidas e pendentes
          <Icon name="chevronDown" className="!h-4 !w-4 text-brand transition-transform group-open:rotate-180"/>
        </summary>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {[...PARTNER_REQUIRED,...PARTNER_OPTIONAL].map(item=>{
            const filled=flags?.[item.key];
            return <div key={item.key} className="flex items-center justify-between gap-2 border-b border-line py-2.5 text-[12px]">
              <span className="min-w-0 break-words text-ink">{item.label}</span>
              <Badge tone={flags===null?'quiet':filled?'success':'warning'}>
                {flags===null?'Não verificado':filled?'Preenchido':'Pendente'}
              </Badge>
            </div>;
          })}
        </div>
      </details>
    </Card>

    {!ready?<Note tone="warning" title="Ativação pendente" className="mb-4">
      As informações completas e a foto dependem da migração 22 do Supabase.
      A pousada pode continuar consultando suas indicações normalmente.
    </Note>:null}

    <div className="grid gap-4">
      <Card>
        <details className="group" open={!progress.ready}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-bold text-ink [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-3">
              <Icon name="home" className="!h-6 !w-6 text-brand"/> Informações da pousada
            </span>
            <Icon name="chevronDown" className="!h-5 !w-5 text-brand transition-transform group-open:rotate-180"/>
          </summary>
          <p className="mt-2 text-[12px] text-muted">
            Atualize contatos e endereço. Nome e praia podem ser alterados enquanto o cadastro está em análise.
          </p>
          <ActionForm action={savePartnerProfile} submitLabel="Salvar informações da pousada"
            className="mt-4 grid gap-3">
            <Field label="Nome da pousada">
              <input name="name" required minLength={2} maxLength={120}
                defaultValue={partner.name} readOnly={isApproved}
                className={inputClass}/>
            </Field>
            <Field label="Praia de referência">
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
            <Field label="Endereço da pousada">
              <input name="address" required minLength={5} maxLength={200}
                defaultValue={d?.address??''} placeholder="Rua, número e referência" className={inputClass}/>
            </Field>
            <Field label="Instagram (opcional)">
              <input name="instagram" maxLength={80}
                defaultValue={d?.instagram??''} placeholder="@suapousada" className={inputClass}/>
            </Field>
          </ActionForm>
        </details>
      </Card>

      <Card>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-bold text-ink [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-3">
              <Icon name="wallet" className="!h-6 !w-6 text-brand"/> Dados de recebimento
            </span>
            <Icon name="chevronDown" className="!h-5 !w-5 text-brand transition-transform group-open:rotate-180"/>
          </summary>
          <p className="mt-2 text-[12px] text-muted">
            Informe a conta para futuros repasses. Seus dados bancários são privados e não ativam pagamentos automáticos.
          </p>
          <ActionForm action={savePartnerPayout} submitLabel="Salvar dados de recebimento"
            className="mt-4 grid gap-3">
            <PartnerPayoutFields saved={payout.data??null}/>
          </ActionForm>
        </details>
      </Card>

      <Card>
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <Icon name="grid" className="!h-5 !w-5 text-brand"/> Acesso rápido
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href="/pousada/divulgacao" variant="soft" icon="link" size="sm">Meu link e QR</ButtonLink>
          <ButtonLink href="/pousada/indicacoes" variant="soft" icon="chart" size="sm">Indicações</ButtonLink>
          <ButtonLink href="/pousada/central" variant="ghost" icon="grid" size="sm">Central da pousada</ButtonLink>
        </div>
        <p className="mt-4 break-all text-[12px] text-muted">Conta: {viewer.email??'E-mail não informado'}</p>
        <form action={signOut} className="mt-4">
          <button type="submit" className="press flex min-h-11 items-center gap-2 rounded-full border border-line px-5 text-[13px] font-semibold text-brand">
            <Icon name="logout" className="!h-4 !w-4"/> Sair desta conta
          </button>
        </form>
      </Card>
    </div>
    <PartnerFootnote/>
  </>;
}
