/** Stage 3B stays OFF in the deployed service until migration 39 is reviewed
 * and applied to the target Supabase. Never expose an active form first. */
export function protectionStage3Enabled(): boolean {
  return process.env.NEXT_PUBLIC_VENTO_PROTEGE_STATEMENTS_ENABLED === 'true';
}

export const PROTECTION_DECLARATIONS = {
  delivered: 'Aula realizada integralmente',
  partially_delivered: 'Aula realizada parcialmente',
  not_delivered: 'Aula não aconteceu',
  student_absent: 'Aluno não compareceu',
  weather_or_safety: 'Vento, clima ou segurança impediram a aula',
} as const;
export type ProtectionDeclaration = keyof typeof PROTECTION_DECLARATIONS;

export const PROTECTION_ASSESSMENTS = {
  request_more_evidence: 'Solicitar mais evidências',
  disputed: 'Versões divergentes — em análise',
  suggest_reschedule: 'Recomendar reagendamento',
  refund_eligibility_review: 'Avaliar elegibilidade para restituição',
  no_financial_action: 'Encerrar análise sem decisão financeira',
} as const;

export function claimedMinutesValid(
 declaration: ProtectionDeclaration, claimed: number, scheduled: number,
): boolean {
  if (!Number.isInteger(claimed) || !Number.isInteger(scheduled) || scheduled < 1 ||
      scheduled > 480 || claimed < 0 || claimed > scheduled) return false;
  if (declaration === 'delivered') return claimed === scheduled;
  if (declaration === 'partially_delivered') return claimed > 0 && claimed < scheduled;
  return claimed === 0;
}
