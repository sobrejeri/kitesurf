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
  variant?: 'ocean' | 'lesson' | 'coast';
};

/**
 * Shared desktop-only visual heading for the remaining VentoKite student pages.
 * All page actions and data remain in their existing server/client components.
 */
export function DesktopPageHeader({
  eyebrow, title, lead, icon='kite', backHref, actionHref, actionLabel, variant='ocean',
}:DesktopPageHeaderProps) {
  const background = variant==='lesson' ? '/images/kite-lesson.webp'
    : variant==='coast' ? '/images/prea-coast.webp'
    : '/images/vento-ocean-hero.webp';
  return <header className={`vento-pc-secondary-desktop-header vento-pc-detail-hero vento-pc-detail-hero--${variant}`}>
    <img src={background} alt="" aria-hidden="true" loading="lazy"/>
    <div className="vento-pc-detail-hero-shade" aria-hidden="true"/>
    <div className="vento-pc-detail-hero-content">
      <div className="vento-pc-detail-eyebrow"><Icon name={icon}/>{eyebrow}</div>
      <h1>{title}</h1>
      <p>{lead}</p>
      <div className="vento-pc-detail-hero-actions">
        {backHref?<Link href={backHref} className="vento-pc-secondary-back"><Icon name="back"/> Voltar</Link>:null}
        {actionHref&&actionLabel?<Link href={actionHref} className="vento-pc-secondary-action">
          {actionLabel}<Icon name="arrow"/>
        </Link>:null}
      </div>
    </div>
  </header>;
}
