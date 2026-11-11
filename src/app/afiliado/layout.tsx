import type { Metadata, Viewport } from 'next';

/**
 * VentoKite Afiliados as its own installable app: its own manifest (scope
 * /afiliado/), icon and home-screen name. It was the Pousada app; /pousada/*
 * now redirects here (next.config.mjs). Signed-in pages live in (app).
 */
export const metadata: Metadata = {
  manifest: '/apps/afiliado.webmanifest',
  applicationName: 'VentoKite Afiliados',
  appleWebApp: { capable: true, title: 'Afiliados', statusBarStyle: 'black-translucent' },
  icons: { icon: '/apps/afiliado-192.png', apple: '/apps/afiliado-192.png' },
};

// The navy of the app bar, so the phone's status bar blends into it.
export const viewport: Viewport = { themeColor: '#0b1220' };

export default function AfiliadoAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
