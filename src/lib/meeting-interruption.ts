/**
 * #93 Etapa 2/4: regras puras (sem banco, sem React) da interrupção por aula e da retomada.
 * O banco é quem decide (RPCs interrupt_meeting, schedule_meeting_resume, complete_meeting_with_skills); aqui só se
 * valida o que o formulário envia e se calcula o que a tela mostra.
 */

/** Feature flag. DESLIGADA por padrão: só `NEXT_PUBLIC_VENTO_INTERRUPTION_FLOW_ENABLED=true` liga, e só depois de aplicada a
 * migration 20261121120000 e da revisão da etapa 3. Com a flag desligada nada muda para o instrutor nem para o aluno. */
export function interruptionFlowEnabled(value: string | undefined = process.env.NEXT_PUBLIC_VENTO_INTERRUPTION_FLOW_ENABLED): boolean {
  return value === 'true';
}

export const MAX_RESUME_DAYS = 90;
export const REASON_MIN = 8;
export const REASON_MAX = 500;

export type InterruptionState = 'awaiting_resume' | 'resume_scheduled' | 'resumed';

/** Restante possível: de 1 minuto até (previsto − já ministrado). Quando não sobra nada, a aula deve ser concluída normalmente. */
export function remainingBounds(plannedMinutes: number, previousDone: number, doneNow: number): { min: number; max: number; canInterrupt: boolean } {
  const max = Math.max(0, Math.trunc(plannedMinutes) - Math.trunc(previousDone) - Math.trunc(doneNow));
  return { min: 1, max, canInterrupt: max >= 1 };
}

export type StepSelections = { practiced: number[]; mastered: number[] };

/** Lê `step1..step6` ('none' | 'practiced' | 'mastered'); qualquer outro valor é recusado. */
export function parseStepSelections(get: (name: string) => unknown): StepSelections | { error: string } {
  const practiced: number[] = [];
  const mastered: number[] = [];
  for (let step = 1; step <= 6; step++) {
    const value = get('step' + step);
    if (value !== 'none' && value !== 'practiced' && value !== 'mastered') return { error: 'Confira a evolução de cada etapa do kite.' };
    if (value === 'practiced') practiced.push(step);
    if (value === 'mastered') mastered.push(step);
  }
  return { practiced, mastered };
}

/** Os minutos e as etapas andam juntos: minutos > 0 pedem ao menos uma etapa; 0 minuto não aceita etapa. */
export function checkMinutesAndSteps(doneMinutes: number, steps: StepSelections): string | null {
  const count = steps.practiced.length + steps.mastered.length;
  if (doneMinutes > 0 && count === 0) return 'Marque pelo menos uma etapa trabalhada nesta aula.';
  if (doneMinutes === 0 && count > 0) return 'Não é possível registrar etapas com zero minutos realizados.';
  return null;
}

/**
 * "2026-11-25T09:00" (campo datetime-local, horário de Fortaleza, UTC-3 o ano todo) -> ISO em UTC.
 * Recusa formato inválido, data inexistente (30/02), passado e mais de 90 dias à frente.
 */
export function parseFortalezaLocal(value: unknown, nowMs: number = Date.now()): { iso: string } | { error: string } {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return { error: 'Escolha a data e a hora da continuidade.' };
  const ms = Date.parse(`${value}:00-03:00`);
  if (!Number.isFinite(ms)) return { error: 'Data inválida.' };
  if (ms <= nowMs) return { error: 'A continuidade precisa ser em uma data futura.' };
  if (ms > nowMs + MAX_RESUME_DAYS * 86_400_000) return { error: `A continuidade deve ser agendada em até ${MAX_RESUME_DAYS} dias.` };
  return { iso: new Date(ms).toISOString() };
}

/** Rótulo curto do estado de continuidade, para o instrutor. */
export function interruptionBadge(state: InterruptionState | null | undefined): { label: string; tone: 'warning' | 'brand' | 'quiet' } | null {
  if (state === 'awaiting_resume') return { label: 'Interrompida · agendar continuidade', tone: 'warning' };
  if (state === 'resume_scheduled') return { label: 'Continuidade agendada', tone: 'brand' };
  if (state === 'resumed') return { label: 'Retomada e concluída', tone: 'quiet' };
  return null;
}

/** Instante -> valor de <input type="datetime-local"> em horário de Fortaleza ("2026-11-25T09:00"). */
export function fortalezaLocalInput(ms: number): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(ms)).replace(' ', 'T');
}

/** Encontro interrompido que ainda espera o instrutor agendar a continuidade: não é "próximo encontro" nem "atrasado" para o aluno. */
export function isAwaitingResume(meeting: { interruption_state?: InterruptionState | null }): boolean {
  return meeting.interruption_state === 'awaiting_resume';
}

/** Texto fixo da regra aprovada (21/11): a plataforma não cria saldo nem cobra de novo; o aluno combina a continuidade pelo chat. */
export function interruptionCopy(
  state: InterruptionState | null | undefined,
  minutes: { plannedMinutes?: number | null; previousDone?: number; remaining?: number | null },
): { title: string; body: string; badge: string } | null {
  const done = minutes.previousDone ?? 0;
  const planned = minutes.plannedMinutes ?? null;
  const ratio = planned ? ` Foram ministrados ${done} de ${planned} minutos.` : '';
  if (state === 'awaiting_resume') {
    return {
      title: 'Aula interrompida.',
      body: `Entre em contato com seu instrutor pelo chat para combinar a continuidade.${ratio} Não há nova cobrança.`,
      badge: 'Interrompida',
    };
  }
  if (state === 'resume_scheduled') {
    return { title: 'Continuidade agendada.', body: `Seu instrutor marcou a continuação desta mesma aula.${ratio} Não há nova cobrança.`, badge: 'Continuidade agendada' };
  }
  if (state === 'resumed') {
    return { title: 'Aula retomada e concluída.', body: 'A continuação foi registrada e a aula conta uma única vez na sua evolução.', badge: 'Retomada e concluída' };
  }
  return null;
}
