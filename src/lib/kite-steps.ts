/** Level names, medals and lessons use the existing booking enum values. */
import type { LessonLevel } from '@/lib/data-labels';

export const KITE_LEVELS: readonly LessonLevel[] = ['first_time','returning','improving'];
export const KITE_LEVEL_BADGES: Record<LessonLevel, {label:string;metal:string;detail:string; className:string}> = {
  first_time: {label:'Iniciante',metal:'Bronze',detail:'Controle e segurança',className:'border-[#be8854] bg-[#392a24] text-[#f8bc82]'},
  returning: {label:'Intermediário',metal:'Prata',detail:'Autonomia e navegação',className:'border-[#9bacbf] bg-[#293847] text-[#d5e4f2]'},
  improving: {label:'Avançado',metal:'Ouro',detail:'Performance e especialização',className:'border-[#cda347] bg-[#48381d] text-[#f8dd84]'},
};

export function allowedLessonLevels(level: LessonLevel): LessonLevel[] {
  return KITE_LEVELS.slice(KITE_LEVELS.indexOf(level));
}
export function isAllowedLessonLevel(studentLevel: LessonLevel, lessonLevel: LessonLevel) {
  return allowedLessonLevels(studentLevel).includes(lessonLevel);
}

export const KITE_CURRICULA: Record<LessonLevel, readonly {id:number;title:string;description:string}[]> = {
  first_time: [
    {id:1,title:'Teoria, equipamento e montagem',description:'Vento, previsão, linhas, barra, kite e checagem pré-voo.'},
    {id:2,title:'Pilotagem em terra',description:'Controle do kite nas zonas neutra e de potência.'},
    {id:3,title:'Sistemas de segurança',description:'Quick release, regras de segurança e autorresgate.'},
    {id:4,title:'Controle na água e relançamento',description:'Entrada e saída seguras da água, relançamento do kite.'},
    {id:5,title:'Body drag e recuperação da prancha',description:'Tração na água, inclusive body drag a barlavento.'},
    {id:6,title:'Introdução ao waterstart',description:'Posicionamento e primeiras tentativas de subir na prancha.'},
  ],
  returning: [
    {id:1,title:'Bordos com controle',description:'Navegação em ambas as direções, velocidade e equilíbrio.'},
    {id:2,title:'Orçar (upwind)',description:'Manter a borda e retornar ao ponto de partida.'},
    {id:3,title:'Transições básicas',description:'Mudanças de direção com controle e sem parar.'},
    {id:4,title:'Condições variadas e prioridades',description:'Rajadas, ondulações, espaço e regras de preferência.'},
    {id:5,title:'Autonomia e segurança no mar',description:'Gestão de riscos, autorresgate e navegação independente.'},
    {id:6,title:'Introdução a pop e pequenos saltos',description:'Técnica de impulsão apenas em condições seguras e com avaliação.'},
  ],
  improving: [
    {id:1,title:'Freeride e Big Air',description:'Controle, saltos e aterrissagem; alturas maiores apenas com condições e preparação.'},
    {id:2,title:'Rotações e transições aéreas',description:'Backroll, frontroll e técnicas avançadas progressivas.'},
    {id:3,title:'Freestyle / Wakestyle',description:'Desclipagem e manobras especializadas sob orientação.'},
    {id:4,title:'Wave / Kite-surf',description:'Uso de prancha direcional e leitura das ondas.'},
    {id:5,title:'Hydrofoil',description:'Equilíbrio, arrancadas e controle do foil.'},
    {id:6,title:'Downwind e gestão de percurso',description:'Leitura das condições, autonomia e planejamento de travessias.'},
  ],
};

export type KiteStepResult = 'practiced'|'mastered';
export type MeetingKiteSkill = { meeting_id:string;step_number:number;result:KiteStepResult };

export function kiteStageStatus(rows:readonly MeetingKiteSkill[],stepNumber:number):'pending'|KiteStepResult {
  const matching=rows.filter(x=>x.step_number===stepNumber);
  return matching.some(x=>x.result==='mastered')?'mastered':matching.length?'practiced':'pending';
}
// Legacy import while existing clients move to curriculum-per-level.
export const KITE_STEPS = KITE_CURRICULA.first_time;
