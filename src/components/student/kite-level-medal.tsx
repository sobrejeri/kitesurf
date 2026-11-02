import type { LessonLevel } from '@/lib/data-labels';
import { KITE_LEVEL_BADGES } from '@/lib/kite-steps';

export function KiteLevelMedal({
  level,
  assessed = false,
  compact = false,
}: {level:LessonLevel;assessed?:boolean;compact?:boolean}) {
  const badge = KITE_LEVEL_BADGES[level];
  const description = `${badge.label} · ${badge.metal} · ${assessed ? 'Avaliado por instrutor' : 'Nível informado'}`;

  if (compact) {
    const colors: Record<LessonLevel, { ribbon: string; disc: string; light: string; rim: string; star: string }> = {
      first_time: {
        ribbon: '#8e4c35', disc: '#b97842', light: '#e8ae72',
        rim: '#f4c68b', star: '#fff1c6',
      },
      returning: {
        ribbon: '#61788d', disc: '#a8bdcf', light: '#e5eff8',
        rim: '#f4f9ff', star: '#536b80',
      },
      improving: {
        ribbon: '#ab7825', disc: '#d8ab38', light: '#ffe28a',
        rim: '#ffefb3', star: '#80551e',
      },
    };
    const color = colors[level];
    return (
      <span
        className="inline-flex h-10 w-9 shrink-0 items-center justify-center align-middle drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
        role="img"
        aria-label={description}
        title={description}
      >
        <svg viewBox="0 0 40 44" className="h-10 w-9" aria-hidden="true">
          <path d="M8 2h10l6 17-9 3z" fill={color.ribbon} stroke={color.rim} strokeWidth="0.8" />
          <path d="M22 2h10l-7 20-9-3z" fill={color.ribbon} stroke={color.rim} strokeWidth="0.8" />
          <circle cx="20" cy="26" r="14.5" fill={color.disc} stroke={color.rim} strokeWidth="2" />
          <circle cx="20" cy="26" r="10.5" fill="none" stroke={color.light} strokeWidth="1.5" />
          <path
            d="m20 17 2.75 5.7 6.3.9-4.55 4.45 1.1 6.25L20 31.4l-5.6 2.9 1.1-6.25-4.55-4.45 6.3-.9z"
            fill={color.star}
          />
        </svg>
      </span>
    );
  }

  return (
    <span className={'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ' + badge.className}
      title={assessed ? 'Nível avaliado por instrutor após aula' : 'Nível informado pelo aluno'}>
      <span aria-hidden="true">✦</span>
      {badge.label} · {badge.metal}
      {assessed ? <span className="text-[10px]" aria-label="Avaliado por instrutor">✓</span> : null}
    </span>
  );
}
