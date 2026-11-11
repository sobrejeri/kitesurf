/**
 * Compact title of a student secondary screen on phones and tablets: the
 * screen name and one short line of status, like a native app. From 1024px
 * the desktop header (DesktopPageHeader) takes over, so this one hides.
 *
 * Pages that use it start below the floating phone app bar through the
 * shared `vento-mobile-appbar-clearance` wrapper.
 */
export function StudentPageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="vento-student-page-title mb-4 flex items-end justify-between gap-3 lg:hidden">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold leading-[1.15] tracking-[-0.03em] text-white">{title}</h1>
        {subtitle ? <p className="mt-1 text-[14px] leading-snug text-[#b3d4e0]">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 pb-0.5">{action}</div> : null}
    </header>
  );
}
