/** Stage 3B UI is deliberately OFF until real-user and Storage end-to-end QA.
 * Migration 41 also revokes mutation RPC grants at the database boundary.
 * Enabling this build-time UI flag alone NEVER unlocks database writes:
 * a separate reviewed release migration must first restore the RPC grants. */
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
