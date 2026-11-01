import type { Metadata } from 'next';

import { updateInstructorProfile } from '@/app/actions/instructor';
import { saveInstructorPersonal, uploadInstructorAvatar } from '@/app/actions/instructor-profile';
import { ActionForm } from '@/components/action-form';
import { InstructorCompletionPanel } from '@/components/instructor/completion-panel';
import { Icon } from '@/components/icon';
import { InstructorMultiSelect } from '@/components/instructor/instructor-multi-select';
import { ProfilePhotoPicker } from '@/components/profile-photo-picker';
import { InstructorPayoutForm } from '@/components/instructor/payout-form';
import { Badge, Card, Field, Note, inputClass, textareaClass } from '@/components/ui';
import { LANGUAGES } from '@/data/demo';
import { requireRole } from '@/lib/auth';
import { getOwnInstructor, listActiveBeaches } from '@/lib/data';
import { computeInstructorCompletion, type DocumentRecord, type ProgressFlags } from '@/lib/instructor-completion';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Perfil profissional' };

const STATUS = { pending: 'Em análise', approved: 'Aprovado', paused: 'Pausado' } as const;

type PrivateProfile = { phone: string; city: string; bio: string; avatar_path: string | null };
type PayoutInfo = { method: 'pix' | 'bank' };

export default async function InstructorProfileFormPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/cadastro');
  const [me, active] = await Promise.all([getOwnInstructor(viewer.id), listActiveBeaches()]);
  const supabase = await createSupabaseServerClient();
  // These private tables are introduced in a separate SQL migration. An older
  // deployment can still show and save the original professional fields.
  const [privateResult, payoutResult, documentsResult] = await Promise.all([
    supabase.from('instructor_private_profiles')
      .select('phone, city, bio, avatar_path').eq('id', viewer.id).maybeSingle<PrivateProfile>(),
    supabase.from('instructor_payout_details')
      .select('method').eq('id', viewer.id).maybeSingle<PayoutInfo>(),
    supabase.from('instructor_documents').select('kind,status')
      .eq('instructor_id',viewer.id).in('kind',['identity','certification'])
      .returns<DocumentRecord[]>(),
  ]);
  const privateReady = !privateResult.error;
  const payoutReady = !payoutResult.error;
  if (privateResult.error) console.warn('[instructor-profile] Personal fields unavailable', { code: privateResult.error.code });
  if (payoutResult.error) console.warn('[instructor-profile] Payout fields unavailable', { code: payoutResult.error.code });
  const info = privateResult.data;
  // Instructor can inspect only their own private fields. Admin will use a
  // restricted RPC returning presence booleans, never their actual values.
  const flags: ProgressFlags | null = privateReady && payoutReady ? {
    fullName: (viewer.fullName??'').trim().length>=2,
    phone: Boolean(info?.phone?.trim()),
    city: Boolean(info?.city?.trim()),
    bio: Boolean(info?.bio?.trim()),
    photo: Boolean(info?.avatar_path),
    beaches: (me?.beaches.length??0)>0,
    languages: (me?.languages.length??0)>0,
    experience: me?.years_experience!=null,
    equipment: Boolean(me?.has_equipment),
    supportVehicle: Boolean(me?.has_support_vehicle),
    payout: Boolean(payoutResult.data),
  } : null;
  const completion = computeInstructorCompletion(
    flags,documentsResult.error?null:documentsResult.data??[],
  );
  let avatarUrl: string | null = null;
  if (info?.avatar_path) {
    try {
      const { data: image, error: imageError } = await supabase.storage
        .from('vento-instructor-avatars').createSignedUrl(info.avatar_path, 60 * 60);
      if (imageError) {
        console.error('[instructor-profile] Avatar preview unavailable', { message: imageError.message });
      } else {
        avatarUrl = image?.signedUrl ?? null;
      }
    } catch (error) {
      // The professional profile must remain usable when a private image
      // cannot be retrieved (deleted object, expired session or storage outage).
      console.error('[instructor-profile] Could not load avatar preview', error);
    }
  }

  const mine = new Set(me?.beaches.map((beach) => beach.id));
  const options = [...active, ...(me?.beaches.filter((beach) => !active.some((a) => a.id === beach.id)) ?? [])];

  return (
    <div className="mx-auto max-w-4xl pb-10">
      <header className="mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[1.8px] text-brand">Meu espaço profissional</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[27px] font-extrabold leading-tight tracking-[-.7px] text-ink sm:text-[32px]">Meu perfil</h1>
          {me ? <Badge tone={me.status === 'approved' ? 'success' : 'warning'}>{STATUS[me.status]}</Badge> : null}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">Complete seus dados, escolha onde atende e configure suas informações de recebimento.</p>
      </header>

      <div className="grid gap-4">
        <InstructorCompletionPanel completion={completion} audience="instructor" yearsExperience={me?.years_experience}/>
        <Card className="!p-4 sm:!p-6" >
          <div id="cadastro-foto" className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left">
            <ProfilePhotoPicker
              action={uploadInstructorAvatar}
              photoUrl={avatarUrl}
              name={viewer.fullName || 'Instrutor'}
              enabled={privateReady}
              accent="orange"
            />
            <div className="min-w-0 w-full flex-1">
              <h2 className="break-words text-[18px] font-bold leading-snug text-ink">{viewer.fullName?.trim() || 'Instrutor'}</h2>
              <p className="mt-1 break-all text-[12px] leading-relaxed text-muted">{viewer.email}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                {avatarUrl ? 'Use o + para trocar a foto.' : 'Toque no + para adicionar uma foto.'}
              </p>
              <Badge tone={info?.avatar_path?'success':'warning'}>
                {info?.avatar_path?'Foto cadastrada':'Foto recomendada'}
              </Badge>
            </div>
          </div>
        </Card>

        <Card className="!p-4 sm:!p-6">
          <details className="group">
            <summary id="cadastro-pessoais" className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-brand-soft text-brand">
                  <Icon name="user" className="!h-5 !w-5" />
                </span>
                <span className="min-w-0">
                  <strong className="block text-[17px] font-extrabold leading-snug text-ink">Informações pessoais</strong>
                  <span className="mt-1 block text-[12px] leading-relaxed text-muted">
                    {completion.required.filter(x=>x.group==='Pessoal').every(x=>x.state==='done')
                      ? 'Dados pessoais preenchidos · toque para editar'
                      : 'Há dados pessoais pendentes · toque para preencher'}
                  </span>
                </span>
              </span>
              <Icon name="chevronDown" className="!h-5 !w-5 shrink-0 text-brand transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-[12px] leading-relaxed text-muted">Seus dados de contato são privados e não aparecem na fila de instrutores.</p>
              {privateReady ? (
            <ActionForm action={saveInstructorPersonal} submitLabel="Salvar dados pessoais" wideSubmit className="mt-4 grid gap-4">
              <Field label="Nome completo">
                <input name="fullName" defaultValue={viewer.fullName} autoComplete="name" minLength={2} maxLength={120} required className={inputClass} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Telefone / WhatsApp">
                  <input type="tel" name="phone" defaultValue={info?.phone ?? ''} autoComplete="tel" maxLength={20} placeholder="(88) 99999-9999" className={inputClass} />
                </Field>
                <Field label="Cidade de residência">
                  <input name="city" defaultValue={info?.city ?? ''} maxLength={80} placeholder="Ex.: Jijoca de Jericoacoara" className={inputClass} />
                </Field>
              </div>
              <Field label="Apresentação profissional" hint="Conte brevemente sobre sua experiência e metodologia. Até 500 caracteres.">
                <textarea name="bio" defaultValue={info?.bio ?? ''} maxLength={500} rows={3} className={textareaClass} />
              </Field>
            </ActionForm>
              ) : (
                <Note tone="warning" className="mt-4">Para salvar telefone, cidade e apresentação, instale a migração do perfil no Supabase.</Note>
              )}
            </div>
          </details>
        </Card>

        <Card className="!p-4 sm:!p-6">
          <details className="group">
            <summary id="cadastro-atendimento" className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-brand-soft text-brand">
                  <Icon name="kite" className="!h-5 !w-5" />
                </span>
                <span className="min-w-0">
                  <strong className="block text-[17px] font-extrabold leading-snug text-ink">Onde e como você atende</strong>
                  <span className="mt-1 block text-[12px] leading-relaxed text-muted">
                    {me?.beaches.length ?? 0} praia(s) · {me?.languages.length ?? 0} idioma(s)
                  </span>
                </span>
              </span>
              <Icon name="chevronDown" className="!h-5 !w-5 shrink-0 text-brand transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-[12px] leading-relaxed text-muted">Selecione as praias e os idiomas em que pode ministrar aulas.</p>
              <ActionForm action={updateInstructorProfile} submitLabel="Salvar atendimento" wideSubmit className="mt-4 grid gap-4">
            <Field label="Anos de experiência">
              <input name="years" type="number" min={0} max={60} defaultValue={me?.years_experience ?? 0} className={inputClass} />
            </Field>
            <InstructorMultiSelect
              name="beachIds" label="Praias onde você atende" emptyText="Selecionar praias"
              options={options.map((beach) => ({ label: beach.name, value: beach.id }))}
              initialValues={[...mine]}
            />
            <InstructorMultiSelect
              name="languages" label="Idiomas das aulas" emptyText="Selecionar idiomas"
              options={LANGUAGES.map((language) => ({ label: language, value: language }))}
              initialValues={me?.languages ?? ['Português']}
            />
            <label className="flex items-start gap-3 rounded-[14px] border border-line bg-surface px-3 py-3 text-[13px] text-ink">
              <input type="checkbox" name="hasEquipment" defaultChecked={me?.has_equipment} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
              Tenho equipamentos para oferecer as aulas
            </label>
            <label className="flex items-start gap-3 rounded-[14px] border border-line bg-surface px-3 py-3 text-[13px] text-ink">
              <input type="checkbox" name="hasSupportVehicle" defaultChecked={me?.has_support_vehicle} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
              <span>Tenho veículo de apoio
                <span className="mt-1 block text-[11px] text-muted">Pedidos com transporte dependem da atualização do módulo de transporte.</span>
              </span>
            </label>
              </ActionForm>
            </div>
          </details>
        </Card>

        <Card className="!p-4 sm:!p-6">
          <details className="group">
            <summary id="cadastro-recebimento" className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-brand-soft text-brand">
                  <Icon name="wallet" className="!h-5 !w-5" />
                </span>
                <span>
                  <strong className="block text-[17px] font-extrabold text-ink">Dados de recebimento</strong>
                  <span className="mt-0.5 block text-[12px] text-muted">{payoutResult.data ? 'Cadastro realizado · toque para atualizar' : 'Pix ou conta bancária · toque para cadastrar'}</span>
                </span>
              </span>
              <Icon name="chevronDown" className="!h-5 !w-5 shrink-0 text-brand transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-5 border-t border-line pt-4">
              <Note tone="warning">Estas informações são privadas. O cadastro não realiza nem libera repasses. A ativação financeira depende de um provedor de pagamentos.</Note>
              {payoutReady ? (
                <>
                  {payoutResult.data ? <p className="my-3 text-[12px] text-muted">Para alterar o destino cadastrado, informe novamente os dados completos. A chave e o número da conta não são exibidos por segurança.</p> : null}
                  <div className="mt-4">
                    <InstructorPayoutForm holderName={viewer.fullName} initialMethod={payoutResult.data?.method ?? 'pix'} />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-[12px] text-muted">Disponível depois da instalação da migração de dados privados no Supabase.</p>
              )}
            </div>
          </details>
        </Card>

        <Card className="!p-4 sm:!p-6">
          <a href="/instrutor/avaliacoes" className="press flex min-h-12 items-center justify-between gap-3 rounded-xl text-[16px] font-bold text-ink">
            <span>★ Minhas avaliações</span>
            <span className="text-[12px] font-semibold text-brand">Ver comentários</span>
          </a>
        </Card>

        <Note title={me?.status==='approved'?'Cadastro aprovado':'Próximos passos para sua aprovação'}>
          {me?.status==='approved'
            ? 'Seu cadastro está aprovado. Continue atualizando suas informações para receber solicitações compatíveis.'
            : completion.readyForApproval
              ? 'Os dados essenciais estão completos e os documentos foram aprovados. Aguarde a liberação pela administração.'
              : 'Confira os campos pendentes no painel de progresso e os documentos em análise. A administração só poderá validar o cadastro quando tudo estiver em ordem.'}
          {' '}<a href="/instrutor/documentos" className="font-semibold underline">Acompanhar documentos</a>
        </Note>
      </div>
    </div>
  );
}
