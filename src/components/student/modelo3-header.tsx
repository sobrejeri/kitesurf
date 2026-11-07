import Link from 'next/link';
import { Icon } from '@/components/icon';
import { OfficialLogo } from '@/components/official-logo';

/**
 * VentoKite Modelo 03: visual-only hero for student screens.
 * All booking/profile data remains rendered by each page's existing components.
 */
export function KiteModelo3Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/aluno/inicio" className={`kite-m3-logo ${compact ? 'kite-m3-logo--compact' : ''}`}
      aria-label="VentoKite — início">
      <OfficialLogo compact={compact} />
    </Link>
  );
}

export function KiteModelo3Header({
  title,
  subtitle,
  actionHref,
  actionLabel,
}: {
  title?: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <header className="kite-m3-header">
      <div className="kite-m3-header__texture" aria-hidden="true" />
      <div className="kite-m3-header__inner">
        <KiteModelo3Brand />
        {title ? (
          <div className="kite-m3-header__heading">
            <p className="kite-m3-header__eyebrow">SEU ESPAÇO NO KITE</p>
            <h1>{title}</h1>
            {subtitle ? <p className="kite-m3-header__subtitle">{subtitle}</p> : null}
          </div>
        ) : null}
        {actionHref && actionLabel ? (
          <Link className="kite-m3-header__action" href={actionHref}>
            <Icon name="plus" className="!h-4 !w-4" /> {actionLabel}
          </Link>
        ) : null}
      </div>
      <img className="kite-m3-header__kite" src="/images/vento-kite-real.webp" alt="" aria-hidden="true" />
    </header>
  );
}
