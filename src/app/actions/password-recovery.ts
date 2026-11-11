'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { AREA_LIST, verificationPath, type AppArea } from '@/lib/app-areas';
import { SITE_URL } from '@/lib/env';
import { createSupabaseServerClient, currentArea } from '@/lib/supabase/server';
import { friendlyError, type ActionState } from './errors';

const Area = z.enum(AREA_LIST as [AppArea, ...AppArea[]]);

export async function requestPasswordRecovery(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.strictObject({ area: Area, email: z.email().max(200) })
    .safeParse({ area: form.get('area'), email: form.get('email') });
  if (!parsed.success || parsed.data.area !== await currentArea()) return { error: 'Informe um e-mail válido neste aplicativo.' };
  const db = await createSupabaseServerClient(parsed.data.area);
  const { error } = await db.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${SITE_URL}/auth/recovery?area=${parsed.data.area}`,
  });
  if (error) {
    console.error('[auth.recovery]', { code: error.code });
    return { error: 'Não foi possível solicitar o link agora. Aguarde alguns minutos e tente novamente.' };
  }
  return { ok: 'Se houver uma conta com esse e-mail, você receberá um link para redefinir a senha. Confira também o spam e abra o link neste navegador.' };
}

export async function setRecoveredPassword(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.strictObject({ area: Area, password: z.string().min(8).max(200), confirm: z.string().min(8).max(200) })
    .safeParse({ area: form.get('area'), password: form.get('password'), confirm: form.get('confirm') });
  if (!parsed.success) return { error: 'A nova senha precisa ter pelo menos 8 caracteres.' };
  if (parsed.data.password !== parsed.data.confirm) return { error: 'As duas senhas precisam ser iguais.' };
  if (parsed.data.area !== await currentArea()) return { error: 'Solicite um novo link neste aplicativo.' };
  const db = await createSupabaseServerClient(parsed.data.area);
  const { data, error: sessionError } = await db.auth.getUser();
  if (sessionError || !data.user) return { error: 'O link expirou. Solicite outro para redefinir sua senha.' };
  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  // An account with the authenticator app (administrators) confirms the code
  // first, then comes back here to choose the new password.
  if (error?.code === 'insufficient_aal') {
    redirect(verificationPath(parsed.data.area, `/${parsed.data.area}/redefinir`));
  }
  if (error) return { error: friendlyError(error) };
  await db.auth.signOut({ scope: 'local' });
  return { ok: 'Senha atualizada. Entre novamente com sua nova senha.' };
}
