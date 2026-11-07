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
      src="/images/ventokite-logo-transparente.png"
      alt="VentoKite — Aulas de Kitesurf"
      width={960}
      height={264}
      decoding="async"
      className={`vento-official-logo ${compact ? 'vento-official-logo--compact' : ''} ${className}`.trim()}
    />
  );
}
