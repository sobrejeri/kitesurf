import type { Metadata, Viewport } from 'next';

/**
 * VentoKite Instrutor as its own installable app: its own manifest (scope /instrutor/), icon
 * and home-screen name. Pages that need a signed-in user live in (app).
 */
export const metadata: Metadata = {
  manifest: '/apps/instrutor.webmanifest',
  applicationName: 'VentoKite Instrutor',
  appleWebApp: { capable: true, title: 'Instrutor', statusBarStyle: 'black-translucent' },
  icons: { icon: '/apps/instrutor-192.png', apple: '/apps/instrutor-192.png' },
};

// The navy of the app bar, so the phone's status bar blends into it.
export const viewport: Viewport = { themeColor: '#0b1220' };

export default function InstrutorAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
