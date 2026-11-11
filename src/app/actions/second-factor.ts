'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { APP_AREAS, safeNextFor } from '@/lib/app-areas';
import { getViewer } from '@/lib/auth';
import { createSupabaseServerClient, currentArea } from '@/lib/supabase/server';

/**
 * Second factor for administrators (Supabase Auth MFA, TOTP). After the
 * password, the session is aal1; the 6-digit code of an authenticator app
 * raises it to aal2, which the app and the database (migration 48) require
 * for any admin power. The secret is shown once, at set-up, and never logged.
 */
export interface SecondFactorState {
  error?: string;
  enrollment?: { factorId: string; uri: string; secret: string };
}

const SIGN_IN_AGAIN = 'Sua sessão expirou. Entre novamente com sua conta de administrador.';

async function adminSession() {
  const area = await currentArea();
  const viewer = await getViewer();
  if (!viewer || viewer.role !== 'admin') return null;
  return { area, db: await createSupabaseServerClient(area) };
}

/** First time: a new authenticator secret for this account. */
export async function startSecondFactor(_previous: SecondFactorState, _form: FormData): Promise<SecondFactorState> {
  const session = await adminSession();
  if (!session) return { error: SIGN_IN_AGAIN };
  const { db } = session;
  const listed = await db.auth.mfa.listFactors();
  if (listed.error) {
    console.error('[second-factor.list]', { code: listed.error.code, status: listed.error.status });
    return { error: 'Não foi possível consultar a verificação agora. Tente novamente.' };
  }
  if (listed.data.totp.length > 0) {
    return { error: 'Sua conta já tem um app autenticador. Atualize a página e digite o código.' };
  }
  // A set-up left halfway keeps an unverified factor: remove it and start again.
  for (const factor of listed.data.all) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await db.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp', issuer: 'VentoKite' });
  if (error || !data) {
    console.error('[second-factor.enroll]', { code: error?.code, status: error?.status });
    return {
      error: error?.code === 'mfa_totp_enroll_not_enabled'
        ? 'O app autenticador (TOTP) está desligado no Supabase. Ative em Authentication › Multi-Factor e tente de novo.'
        : 'Não foi possível ativar a verificação em duas etapas agora. Tente novamente em instantes.',
    };
  }
  return { enrollment: { factorId: data.id, uri: data.totp.uri, secret: data.totp.secret } };
}

const Code = z.strictObject({
  factorId: z.uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
  next: z.string().max(200).optional(),
});

/** Checks the 6-digit code; on success this session counts as aal2. */
export async function verifySecondFactor(_previous: SecondFactorState, form: FormData): Promise<SecondFactorState> {
  const session = await adminSession();
  if (!session) return { error: SIGN_IN_AGAIN };
  const parsed = Code.safeParse({
    factorId: form.get('factorId'),
    code: String(form.get('code') ?? '').replace(/\s/g, ''),
    next: form.get('next') || undefined,
  });
  if (!parsed.success) return { error: 'Digite os 6 números que aparecem no app autenticador.' };
  const { error } = await session.db.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) {
    console.warn('[second-factor.verify]', { code: error.code, status: error.status });
    return {
      error: error.status === 429
        ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
        : 'Código incorreto ou expirado. Confira o horário do celular e digite o código atual.',
    };
  }
  redirect(safeNextFor(session.area, parsed.data.next) ?? APP_AREAS[session.area].home);
}
