import type { LessonLevel } from '@/lib/data-labels';
import { KITE_LEVEL_BADGES } from '@/lib/kite-steps';

export function KiteLevelMedal({
  level,
  assessed = false,
}: {level:LessonLevel;assessed?:boolean}) {
  const badge = KITE_LEVEL_BADGES[level];
  return (
    <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ' + badge.className}
      title={assessed ? 'Nível avaliado por instrutor após aula' : 'Nível informado pelo aluno'}>
      <span aria-hidden="true">✦</span>
      {badge.label} · {badge.metal}
      {assessed ? <span className="text-[10px]" aria-label="Avaliado por instrutor">✓</span> : null}
    </span>
  );
}
