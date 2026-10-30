import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';

import { signOut } from '@/app/actions/auth';
import { TopBar } from '@/components/shells';
import { getViewer } from '@/lib/auth';

import './globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Vento · Aulas de kitesurf', template: '%s · Vento' },
  description:
    'Aulas de kitesurf em Preá e Jericoacoara com instrutores independentes.',
  applicationName: 'Vento',
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
  manifest: '/manifest.webmanifest',
  // Opened from the home screen, iOS shows it full screen like an app.
  appleWebApp: { capable: true, title: 'Vento', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  // Content runs under the notch and home indicator; the bars pad themselves
  // with env(safe-area-inset-*).
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays enabled: the layout works at any zoom level.
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="pt-BR" className={dmSans.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <TopBar viewer={viewer ? { name: viewer.fullName || viewer.email || '', role: viewer.role } : null} signOut={signOut} />
        {children}
      </body>
    </html>
  );
}
