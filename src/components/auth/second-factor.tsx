import { redirect } from 'next/navigation';

import { signOut } from '@/app/actions/auth';
import { APP_AREAS, loginPath, safeNextFor, type AppArea } from '@/lib/app-areas';
import { getViewer } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { AuthFrame } from './area-auth';
import { SecondFactorForms } from './second-factor-forms';

/**
 * After the password, an administrator types the code of an authenticator
 * app (or sets one up, the first time). Every other account goes straight on.
 */
export async function SecondFactorScreen({ area, next }: { area: AppArea; next?: string }) {
  const viewer = await getViewer();
  if (!viewer) redirect(loginPath(area, next));
  const destination = safeNextFor(area, next) ?? APP_AREAS[area].home;
  if (viewer.role !== 'admin' || viewer.secondFactor) redirect(destination);

  const db = await createSupabaseServerClient(area);
  const { data, error } = await db.auth.mfa.listFactors();
  if (error) console.error('[second-factor.screen]', { code: error.code, status: error.status });
  const factor = data?.totp[0] ?? null;

  return (
    <AuthFrame area={area}
      title={factor ? 'Confirme que é você.' : 'Proteja sua conta.'}
      highlight={factor ? 'é você.' : 'sua conta.'}
      lead={factor ? 'Verificação em duas etapas da administração.' : 'A administração entra com senha e código do celular.'}>
      <SecondFactorForms factorId={factor?.id ?? null} next={destination} />
      <form action={signOut} className="mt-4 text-center">
        <button type="submit" className="min-h-11 text-[13px] font-semibold text-brand underline">
          Sair e entrar com outra conta
        </button>
      </form>
    </AuthFrame>
  );
}
