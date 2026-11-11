import type { Metadata, Viewport } from 'next';

/**
 * VentoKite Admin as its own installable app: its own manifest (scope /admin/), icon
 * and home-screen name. Pages that need a signed-in user live in (app).
 */
export const metadata: Metadata = {
  manifest: '/apps/admin.webmanifest',
  applicationName: 'VentoKite Admin',
  appleWebApp: { capable: true, title: 'Vento Admin', statusBarStyle: 'black-translucent' },
  icons: { icon: '/apps/admin-192.png', apple: '/apps/admin-192.png' },
};

// The navy of the app bar, so the phone's status bar blends into it.
export const viewport: Viewport = { themeColor: '#0b1220' };

export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
