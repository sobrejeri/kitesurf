import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';

type DesktopPageHeaderProps = {
  eyebrow: string;
  title: string;
  lead: string;
  icon?: IconName;
  backHref?: string;
  actionHref?: string;
  actionLabel?: string;
  /** Kept as a modifier class for page-specific accents. */
  variant?: 'ocean' | 'lesson' | 'coast';
};

/**
 * Desktop-only title of the student secondary pages: a round back button,
 * the screen name and one line of context, like a web app's page header.
 * The photographic banners stay on the four main screens only. All page
 * actions and data remain in their existing server/client components.
 */
export function DesktopPageHeader({
  eyebrow, title, lead, icon='kite', backHref, actionHref, actionLabel, variant='ocean',
}:DesktopPageHeaderProps) {
  return <header className={`vento-pc-secondary-desktop-header vento-pc-detail-hero vento-pc-detail-hero--${variant}`}>
    {backHref?<Link href={backHref} className="vento-pc-secondary-back" aria-label="Voltar" title="Voltar"><Icon name="back"/></Link>:null}
    <div className="vento-pc-detail-hero-content">
      <div className="vento-pc-detail-eyebrow"><Icon name={icon}/>{eyebrow}</div>
      <h1>{title}</h1>
      <p>{lead}</p>
    </div>
    {actionHref&&actionLabel?<div className="vento-pc-detail-hero-actions">
      <Link href={actionHref} className="vento-pc-secondary-action">{actionLabel}<Icon name="arrow"/></Link>
    </div>:null}
  </header>;
}
