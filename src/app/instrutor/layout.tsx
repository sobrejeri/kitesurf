import type { Metadata, Viewport } from 'next';

/**
 * Vento Instrutor as its own installable app: its own manifest (scope /instrutor/), icon
 * and home-screen name. Pages that need a signed-in user live in (app).
 */
export const metadata: Metadata = {
  manifest: '/apps/instrutor.webmanifest',
  applicationName: 'Vento Instrutor',
  appleWebApp: { capable: true, title: 'Vento Instrutor', statusBarStyle: 'black-translucent' },
  icons: { icon: '/apps/instrutor-192.png', apple: '/apps/instrutor-192.png' },
};

export const viewport: Viewport = { themeColor: '#08101e' };

export default function InstrutorAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
