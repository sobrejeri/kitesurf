/**
 * Single official VentoKite brand asset.
 *
 * Source: logo supplied by the app owner (neon green canopy and waves,
 * white/green VentoKite wordmark, "AULAS DE KITESURF" descriptor).
 * Preserve its aspect ratio and white artwork; do not rebuild the logo
 * from CSS text or crop away the icon.
 */
export function OfficialLogo({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <img
      src="/images/ventokite-logo-oficial.webp"
      alt="VentoKite — Aulas de Kitesurf"
      width={1200}
      height={347}
      decoding="async"
      className={`vento-official-logo ${compact ? 'vento-official-logo--compact' : ''} ${className}`.trim()}
    />
  );
}
