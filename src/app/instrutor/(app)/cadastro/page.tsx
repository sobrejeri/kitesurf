import type { Metadata } from 'next';
import Image from 'next/image';

import { updateInstructorProfile } from '@/app/actions/instructor';
import { saveInstructorPersonal } from '@/app/actions/instructor-profile';
import { ActionForm } from '@/components/action-form';
import { Icon } from '@/components/icon';
import { InstructorMultiSelect } from '@/components/instructor/instructor-multi-select';
import { InstructorAvatarForm } from '@/components/instructor/avatar-form';
import { InstructorPayoutForm } from '@/components/instructor/payout-form';
import { Badge, Card, Field, Note, inputClass, textareaClass } from '@/components/ui';
import { LANGUAGES } from '@/data/demo';
import { requireRole } from '@/lib/auth';
import { getOwnInstructor, listActiveBeaches } from '@/lib/data';
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
  const [privateResult, payoutResult] = await Promise.all([
    supabase.from('instructor_private_profiles')
      .select('phone, city, bio, avatar_path').eq('id', viewer.id).maybeSingle<PrivateProfile>(),
    supabase.from('instructor_payout_details')
      .select('method').eq('id', viewer.id).maybeSingle<PayoutInfo>(),
  ]);
  const privateReady = !privateResult.error;
  const payoutReady = !payoutResult.error;
  if (privateResult.error) console.warn('[instructor-profile] Personal fields unavailable', { code: privateResult.error.code });
  if (payoutResult.error) console.warn('[instructor-profile] Payout fields unavailable', { code: payoutResult.error.code });
  const info = privateResult.data;
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
  const initials = viewer.fullName.trim().split(/\s+/).slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase() || 'IN';

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
        <Card className="!p-4 sm:!p-6">
          <div className="flex items-center gap-3">
            <span className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[22px] border border-line bg-brand-soft text-[22px] font-extrabold text-brand">
              {avatarUrl ? <Image src={avatarUrl} alt="Foto atual do instrutor" width={80} height={80} unoptimized className="h-full w-full object-cover" /> : initials}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-bold text-ink">{viewer.fullName || 'Instrutor'}</h2>
              <p className="mt-1 truncate text-[12px] text-muted">{viewer.email}</p>
              <p className="mt-1 text-[12px] text-muted">{avatarUrl ? 'Foto cadastrada' : 'Adicione uma foto para seu perfil'}</p>
            </div>
          </div>
          {privateReady ? (
            <InstructorAvatarForm />
          ) : (
            <p className="mt-4 text-[12px] text-muted">O envio de foto estará disponível após a atualização do Supabase.</p>
          )}
        </Card>

        <Card className="!p-4 sm:!p-6">
          <h2 className="flex items-center gap-2 text-[18px] font-extrabold text-ink">
            <Icon name="user" className="!h-5 !w-5 text-brand" /> Informações pessoais
          </h2>
          <p className="mt-1 text-[12px] text-muted">Seus dados de contato são privados e não aparecem na fila de instrutores.</p>
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
        </Card>

        <Card className="!p-4 sm:!p-6">
          <h2 className="flex items-center gap-2 text-[18px] font-extrabold text-ink">
            <Icon name="kite" className="!h-5 !w-5 text-brand" /> Onde e como você atende
          </h2>
          <p className="mt-1 text-[12px] text-muted">Selecione todas as praias e idiomas em que pode ministrar aulas.</p>
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
        </Card>

        <Card className="!p-4 sm:!p-6">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
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

        <Note title="Análise do cadastro">
          A administração analisa seu perfil e libera sua participação na fila. Você poderá atualizar praias e idiomas sempre que necessário.
        </Note>
      </div>
    </div>
  );
}
