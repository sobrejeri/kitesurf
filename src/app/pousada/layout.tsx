import type { Metadata, Viewport } from 'next';

/**
 * Vento Pousada as its own installable app: its own manifest (scope /pousada/), icon
 * and home-screen name. Pages that need a signed-in user live in (app).
 */
export const metadata: Metadata = {
  manifest: '/apps/pousada.webmanifest',
  applicationName: 'Vento Pousada',
  appleWebApp: { capable: true, title: 'Vento Pousada', statusBarStyle: 'black-translucent' },
  icons: { icon: '/apps/pousada-192.png', apple: '/apps/pousada-192.png' },
};

export const viewport: Viewport = { themeColor: '#08101e' };

export default function PousadaAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
