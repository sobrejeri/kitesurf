import type { Metadata, Viewport } from 'next';

/**
 * Vento as its own installable app: its own manifest (scope /aluno/), icon
 * and home-screen name. Pages that need a signed-in user live in (app).
 */
export const metadata: Metadata = {
  manifest: '/apps/aluno.webmanifest',
  applicationName: 'Vento',
  appleWebApp: { capable: true, title: 'Vento', statusBarStyle: 'black-translucent' },
  icons: { icon: '/apps/aluno-192.png', apple: '/apps/aluno-192.png' },
};

export const viewport: Viewport = { themeColor: '#08101e' };

export default function AlunoAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
