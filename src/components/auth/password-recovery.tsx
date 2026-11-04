import Link from 'next/link';
import { connection } from 'next/server';
import { requestPasswordRecovery, setRecoveredPassword } from '@/app/actions/password-recovery';
import { APP_AREAS, type AppArea } from '@/lib/app-areas';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ActionForm } from '@/components/action-form';
import { Field, Note, inputClass } from '@/components/ui';
import { StudentBrand } from '@/components/student/sunset';

function RecoveryFrame({ area, title, children }: { area: AppArea; title: string; children: React.ReactNode }) {
  return <div className="theme-sunset min-h-dvh bg-canvas px-5 py-10 text-ink">
    <main className="mx-auto max-w-md">
      <StudentBrand subtitle={APP_AREAS[area].subtitle} />
      <h1 className="mb-5 mt-12 text-[30px] font-bold">{title}</h1>
      <div className="rounded-[22px] border border-line bg-surface p-5">{children}</div>
      <Link href={`/${area}/entrar`} className="mt-6 inline-block min-h-11 text-[14px] text-brand underline">Voltar para entrar</Link>
    </main>
  </div>;
}

export function PasswordRecovery({ area, invalidLink }: { area: AppArea; invalidLink: boolean }) {
  return <RecoveryFrame area={area} title="Recuperar acesso">
    {invalidLink ? <Note tone="warning" className="mb-4">O link é inválido ou expirou. Solicite outro abaixo.</Note> : null}
    <p className="mb-5 text-[14px] text-muted">Informe o e-mail cadastrado. Você receberá um link para escolher uma nova senha.</p>
    <ActionForm action={requestPasswordRecovery} submitLabel="Enviar link de recuperação" className="grid gap-4" wideSubmit>
      <input type="hidden" name="area" value={area} />
      <Field label="E-mail"><input name="email" type="email" required autoComplete="email" maxLength={200} className={inputClass} /></Field>
    </ActionForm>
  </RecoveryFrame>;
}

export async function PasswordReset({ area }: { area: AppArea }) {
  await connection();
  const db = await createSupabaseServerClient(area);
  const { data, error } = await db.auth.getUser();
  return <RecoveryFrame area={area} title="Nova senha">
    {error || !data.user ? <>
      <Note tone="warning">Abra o link recebido por e-mail antes de escolher sua nova senha.</Note>
      <Link href={`/${area}/recuperar`} className="mt-4 inline-block text-[14px] text-brand underline">Solicitar novo link</Link>
    </> : <ActionForm action={setRecoveredPassword} submitLabel="Salvar nova senha" className="grid gap-4" wideSubmit>
      <input type="hidden" name="area" value={area} />
      <Field label="Nova senha" hint="Pelo menos 8 caracteres."><input name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={inputClass} /></Field>
      <Field label="Confirmar nova senha"><input name="confirm" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={inputClass} /></Field>
    </ActionForm>}
  </RecoveryFrame>;
}
