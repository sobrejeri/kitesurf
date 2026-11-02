/** Fixed Vento kitesurf curriculum. IDs are stable database values (1–6). */
export const KITE_STEPS = [
  { id: 1, title: 'Conhecer os equipamentos', description: 'Kite, prancha e acessórios.' },
  { id: 2, title: 'Entender o vento e a janela de voo', description: 'Direção do vento e zona segura de pilotagem.' },
  { id: 3, title: 'Controlar o kite', description: 'Controle na areia e na água, com segurança.' },
  { id: 4, title: 'Body drag', description: 'Deslocamento na água utilizando o kite.' },
  { id: 5, title: 'Waterstart', description: 'Levantar da água e iniciar a navegação.' },
  { id: 6, title: 'Primeiros bordos', description: 'Controle e primeiros percursos de navegação.' },
] as const;

export type KiteStepResult = 'practiced' | 'mastered';
export type MeetingKiteSkill = {
  meeting_id: string;
  step_number: number;
  result: KiteStepResult;
};

/** Skill records are written only when the instructor closes that encounter. */
export function kiteStageStatus(
  rows: readonly MeetingKiteSkill[],
  stepNumber: number,
): 'pending' | KiteStepResult {
  const matching = rows.filter((r) => r.step_number === stepNumber);
  return matching.some((r) => r.result === 'mastered') ? 'mastered'
    : matching.length ? 'practiced' : 'pending';
}
