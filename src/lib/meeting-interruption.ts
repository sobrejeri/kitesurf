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
  // Invalid or inconsistent counters must not enable the interruption form.
  // The database remains authoritative; this protects the client-side bounds.
  const values = [plannedMinutes, previousDone, doneNow];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)
    || plannedMinutes === 0 || previousDone + doneNow > plannedMinutes) {
    return { min: 1, max: 0, canInterrupt: false };
  }
  const max = plannedMinutes - previousDone - doneNow;
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
  // Date.parse normaliza datas impossíveis (ex.: 30/02 vira 02/03). Exigir ida e volta exata
  // no fuso fixo de Fortaleza (UTC-3), incluindo hora/minuto e anos bissextos.
  if (new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 16) !== value) return { error: 'Data inválida.' };
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
