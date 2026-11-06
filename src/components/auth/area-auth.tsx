import Link from 'next/link';

import { signIn, signUp } from '@/app/actions/auth';
import { APP_AREAS, type AppArea } from '@/lib/app-areas';

import { ActionForm } from '../action-form';
import { StudentBrand } from '../student/sunset';
import { KiteModelo3Brand } from '../student/modelo3-header';
import { Field, Note, inputClass } from '../ui';

/**
 * The login and sign-up screens of one app. Full screen, dark, the app's own
 * name on top: opened from the home-screen icon, this is the first thing the
 * user sees.
 */
function AuthFrame({ area, title, highlight, lead, children }: { area: AppArea; title: string; highlight: string; lead: string; children: React.ReactNode }) {
  const info = APP_AREAS[area];
  const at = title.lastIndexOf(highlight);
  return (
    <div className={`${area === 'aluno' ? 'theme-beach kite-m3-auth' : 'theme-sunset'} relative min-h-dvh overflow-hidden bg-canvas text-ink`}>
      <img src={area === 'aluno' ? '/images/prea-coast.webp' : '/images/kite-lesson.webp'} alt="" className="sunset-photo absolute inset-x-0 top-0 h-[46dvh] w-full object-cover" />
      <div className="sunset-veil absolute inset-x-0 top-0 h-[46dvh]" aria-hidden="true" />
      {area === 'aluno' ? <img src="/images/kite-modelo3.svg" alt="" aria-hidden="true" className="kite-m3-auth-kite" /> : null}
      <main className="pt-safe pb-safe relative mx-auto flex min-h-dvh max-w-md flex-col px-5">
        <div className="pt-6">
          {area === 'aluno' ? <KiteModelo3Brand compact /> : <StudentBrand subtitle={info.subtitle} onPhoto />}
        </div>
        <div className="mt-[14dvh]">
          <h1 className="text-[36px] font-bold leading-[1.05] tracking-[-1px] text-white">
            {at >= 0 ? (
              <>
                {title.slice(0, at)}
                <span className="text-sunrise">{highlight}</span>
                {title.slice(at + highlight.length)}
              </>
            ) : (
              title
            )}
          </h1>
          <p className="mt-2 text-[15px] text-[#dfe5ee]">{lead}</p>
        </div>
        <div className="glass mt-6 rounded-[24px] border border-line p-5 shadow-search">{children}</div>
        <span className="flex-1" />
        <p className="py-6 text-center text-[12px] text-muted">{info.appName} · Preá e Jericoacoara</p>
      </main>
    </div>
  );
}

export function AreaLogin({
  area,
  next,
  confirmed,
  wrongAccount,
}: {
  area: AppArea;
  next?: string;
  confirmed?: boolean;
  wrongAccount?: boolean;
}) {
  const info = APP_AREAS[area];
  return (
    <AuthFrame area={area} title={area === 'aluno' ? 'Bem-vindo de volta.' : `Entrar no ${info.appName}.`} highlight={area === 'aluno' ? 'de volta.' : info.appName.replace('Vento ', '') + '.'} lead={`Acesso para ${info.audience}.`}>
      {confirmed ? <Note icon="check" className="mb-4">E-mail confirmado. Agora é só entrar.</Note> : null}
      {wrongAccount ? (
        <Note tone="warning" className="mb-4">Este app é para {info.audience}. Entre com a conta certa.</Note>
      ) : null}
      <ActionForm action={signIn} submitLabel="Entrar" className="grid gap-4" wideSubmit>
        <input type="hidden" name="area" value={area} />
        <input type="hidden" name="next" value={next ?? ''} />
        <Field label="E-mail">
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </Field>
        <Field label="Senha">
          <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </Field>
      </ActionForm>
      <Link href={`/${area}/recuperar`} className="mt-4 block min-h-11 text-center text-[13px] font-semibold text-brand underline">Esqueci minha senha</Link>
      {info.signup ? (
        <p className="mt-5 text-center text-[14px] text-label">
          Ainda não tem conta?{' '}
          <Link href={`/${area}/criar-conta`} className="font-semibold text-brand">
            Criar conta
          </Link>
        </p>
      ) : (
        <p className="mt-5 text-center text-[12px] text-muted">Contas de administrador são criadas pela operação.</p>
      )}
    </AuthFrame>
  );
}

const SIGNUP_COPY: Readonly<Record<Exclude<AppArea, 'admin'>, { title: string; highlight: string; lead: string }>> = {
  aluno: { title: 'Seu primeiro bordo começa aqui.', highlight: 'aqui.', lead: 'Crie sua conta para reservar aulas.' },
  instrutor: { title: 'Ensine com a gente.', highlight: 'com a gente.', lead: 'Seu perfil passa por análise antes de receber pedidos.' },
  pousada: { title: 'Indique bons ventos.', highlight: 'bons ventos.', lead: 'Cadastre sua pousada e ganhe comissão nas aulas.' },
};

export function AreaSignup({ area }: { area: Exclude<AppArea, 'admin'> }) {
  const copy = SIGNUP_COPY[area];
  return (
    <AuthFrame area={area} title={copy.title} highlight={copy.highlight} lead={copy.lead}>
      <ActionForm action={signUp} submitLabel="Criar conta" className="grid gap-4" wideSubmit>
        <input type="hidden" name="role" value={APP_AREAS[area].role} />
        <Field label={area === 'pousada' ? 'Seu nome (responsável)' : 'Nome'}>
          <input name="fullName" required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
        </Field>
        {area === 'aluno' ? (
          <Field label="Qual é seu nível no kitesurf?"
            hint="Obrigatório. É uma autoavaliação, não um certificado. O instrutor poderá avaliar seu nível após a aula.">
            <select name="kiteLevel" required defaultValue="" className={inputClass}>
              <option value="" disabled>Selecione seu nível</option>
              <option value="first_time">Iniciante · Bronze</option>
              <option value="returning">Intermediário · Prata</option>
              <option value="improving">Avançado · Ouro</option>
            </select>
          </Field>
        ) : null}
        <Field label="E-mail">
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </Field>
        <Field label="Senha" hint="Pelo menos 8 caracteres.">
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
        </Field>
      </ActionForm>
      <p className="mt-5 text-center text-[14px] text-label">
        Já tem conta?{' '}
        <Link href={`/${area}/entrar`} className="font-semibold text-brand">
          Entrar
        </Link>
      </p>
    </AuthFrame>
  );
}
