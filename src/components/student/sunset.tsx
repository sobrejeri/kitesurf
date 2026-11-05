import { Icon, type IconName } from '../icon';

/**
 * Building blocks of the student area's sunset look: the wave mark, the photo
 * hero every student page opens with, and the orange-highlighted headings.
 */

/** Two breaking waves — the student-area brand mark. */
export function WaveMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden="true">
      <path d="M2 30c10 0 14-12 26-18 9-4.5 19-3 26 3-8-2-15 0-20 5 6-1 11 1 14 5-8-2-15 1-21 6-9 7-17 6-25-1z" fill="#ff7a1a" />
      <path d="M8 36c9 1 16-2 22-6 7-4.5 15-5.5 24-2-7 1-12 4-17 7-7 4-15 5-29 1z" fill="#ff9a4d" />
    </svg>
  );
}

export function StudentBrand({ subtitle = 'Aulas de kitesurf', onPhoto = false }: { subtitle?: string; onPhoto?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <WaveMark className="h-9 w-14" />
      <span className="leading-none">
        <span className={`block text-[24px] font-bold tracking-[-0.6px] ${onPhoto ? 'text-white' : 'text-logo-ink'}`}>Vento</span>
        <span className={`mt-0.5 block text-[9px] font-medium uppercase tracking-[2px] ${onPhoto ? 'text-white/85' : 'text-label'}`}>{subtitle}</span>
      </span>
    </span>
  );
}

/** "Minhas aulas" with the last word in orange, as the reference does. */
export function HighlightTitle({
  text,
  highlight,
  as: Tag = 'h1',
  className = '',
  highlightClass = 'text-brand',
}: {
  text: string;
  highlight?: string;
  as?: 'h1' | 'h2';
  className?: string;
  highlightClass?: string;
}) {
  if (!highlight || !text.includes(highlight)) return <Tag className={className}>{text}</Tag>;
  const at = text.lastIndexOf(highlight);
  return (
    <Tag className={className}>
      {text.slice(0, at)}
      <span className={highlightClass}>{highlight}</span>
      {text.slice(at + highlight.length)}
    </Tag>
  );
}

export type HeroImage = 'coast' | 'lesson' | 'ocean';

const IMAGES: Readonly<Record<HeroImage, { src: string; position: string }>> = {
  coast: { src: '/images/prea-coast.webp', position: '70% 40%' },
  lesson: { src: '/images/kite-lesson.webp', position: '60% 30%' },
  ocean: { src: '/images/prea-coast.webp', position: '62% 48%' },
};

/**
 * The photo header of a student page. On phones it runs edge to edge under
 * the transparent app bar; from md up it is a rounded banner.
 */
export function StudentHero({
  eyebrow,
  eyebrowIcon,
  title,
  highlight,
  lead,
  image = 'coast',
  compact = false,
  plainOnMobile = false,
  script = false,
  top,
  children,
}: {
  /** Set the highlighted word in the handwritten face (home hero only). */
  script?: boolean;
  /** Shown above the eyebrow, e.g. the location pill on Explorar. */
  top?: React.ReactNode;
  eyebrow?: string;
  eyebrowIcon?: IconName;
  title: string;
  highlight?: string;
  lead?: string;
  image?: HeroImage;
  compact?: boolean;
  /**
   * Sub-pages (profile, evolution, my lessons) drop the decorative photo on
   * phones for a compact text header — it ate half the screen — while keeping
   * the full photo banner from md up.
   */
  plainOnMobile?: boolean;
  children?: React.ReactNode;
}) {
  const photo = IMAGES[image];
  // On phones a plain header hides the photo, veil and wave and uses tight padding.
  const hideMediaMobile = plainOnMobile ? 'max-md:hidden' : '';
  const pad = plainOnMobile
    ? `pt-[calc(env(safe-area-inset-top)+64px)] pb-4 ${compact ? 'md:min-h-[264px] md:py-12' : 'md:py-10'}`
    : (compact
        ? 'min-h-[236px] pb-9 pt-[calc(env(safe-area-inset-top)+88px)] md:min-h-[264px] md:py-12'
        : 'pb-6 pt-[calc(env(safe-area-inset-top)+82px)] md:py-10');
  const titleSize = plainOnMobile
    ? (compact ? 'text-[26px] md:text-[40px]' : 'text-[28px] md:text-[52px]')
    : (compact ? 'text-[30px] md:text-[40px]' : 'text-[34px] md:text-[52px]');
  return (
    <section className={`relative -mx-4 overflow-hidden md:mx-0 md:mt-2 md:rounded-hero ${image === 'ocean' ? 'ocean-hero' : ''}`}>
      {/* Decorative photograph; the heading carries the meaning. */}
      <img
        src={photo.src}
        alt=""
        className={`sunset-photo absolute inset-0 h-full w-full object-cover ${hideMediaMobile}`}
        style={{ objectPosition: photo.position }}
      />
      <div className={`sunset-veil absolute inset-0 ${hideMediaMobile} ${compact && image === 'lesson' ? '!bg-gradient-to-b !from-[#041d32]/40 !via-[#062d48]/45 !to-[#003b59]/95' : ''}`} aria-hidden="true" />
      <div className={`relative px-4 md:px-10 ${pad}`}>
        {top ? <div className="mb-6">{top}</div> : null}
        {eyebrow ? (
          <p className={`text-sunrise flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[2px] ${plainOnMobile ? 'max-md:hidden' : ''}`}>
            {eyebrowIcon ? <Icon name={eyebrowIcon} className="!h-4 !w-4" /> : null}
            {eyebrow}
          </p>
        ) : null}
        <HighlightTitle
          text={title}
          // One colour per title; only the handwritten word stands out.
          highlight={script ? highlight : undefined}
          highlightClass="text-sunrise font-script text-[1.35em] font-bold leading-[0.8] tracking-normal"
          className={`mt-2 max-w-[14ch] font-bold leading-[1.05] tracking-[-1.2px] text-white ${titleSize} ${plainOnMobile ? 'max-md:hidden' : ''}`}
        />
        {lead ? <p className={`mt-3 max-w-[30ch] text-[15px] leading-snug text-[#dfe5ee] ${plainOnMobile ? 'max-md:hidden' : ''}`}>{lead}</p> : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
      {compact && (image === 'lesson' || image === 'ocean') ? <svg className={`pointer-events-none absolute bottom-0 left-0 h-[45px] w-full ${hideMediaMobile}`} viewBox="0 0 390 45" preserveAspectRatio="none" aria-hidden="true"><path d="M0 26 C95 0 140 44 232 18 S350 8 390 16 L390 45 L0 45Z" fill="#00b9d5" opacity=".9"/><path d="M0 37 C95 12 153 48 244 30 S342 23 390 29 L390 45 L0 45Z" fill="#031c31"/></svg> : null}
    </section>
  );
}

/** A round orange-on-dark icon, used in lists and stat cards. */
export function IconBubble({ icon, tone = 'brand', size = 40 }: { icon: IconName; tone?: 'brand' | 'solid'; size?: number }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${tone === 'solid' ? 'bg-brand text-white' : 'bg-brand-soft text-brand'}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon name={icon} className="!h-[20px] !w-[20px]" />
    </span>
  );
}

/** Dashed empty state with an icon, as in "Extrato de horas". */
export function SunsetEmpty({ icon, children, action }: { icon: IconName; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 rounded-search border border-dashed border-line-ghost px-5 py-7 text-center text-[13px] text-muted">
      <Icon name={icon} className="!h-9 !w-9 text-brand" />
      <p className="max-w-[30ch]">{children}</p>
      {action}
    </div>
  );
}

/** Kite over waves, for empty lesson lists. */
export function KiteIllustration() {
  return (
    <svg viewBox="0 0 160 90" className="h-20 w-36" aria-hidden="true">
      <path d="M58 52c4-22 22-38 46-38 8 0 14 2 18 5-12 1-22 8-27 18 8-3 17-2 22 3-10 0-19 5-24 12" fill="none" stroke="#ff7a1a" strokeWidth="5" strokeLinecap="round" />
      <path d="M58 52c4-22 22-38 46-38" fill="none" stroke="#3aa0d8" strokeWidth="5" strokeLinecap="round" />
      <path d="M70 50l10 22M93 47l-6 25" stroke="#8c97aa" strokeWidth="1.5" />
      <path d="M20 78c10-6 20-6 30 0s20 6 30 0 20-6 30 0 20 6 30 0" fill="none" stroke="#8c97aa" strokeWidth="2" strokeLinecap="round" />
      <path d="M32 40c4-2 8-2 12 0M128 30l4-3 4 3" fill="none" stroke="#8c97aa" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
