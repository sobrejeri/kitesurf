import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';

import { DemoBar } from '@/components/shells';

import './globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Vento · Aulas de kitesurf', template: '%s · Vento' },
  description:
    'Esboço navegável de uma plataforma de aulas de kitesurf em Preá e Jericoacoara. Aluno, instrutor, administração e pousada parceira.',
  applicationName: 'Vento',
  icons: { icon: '/icon.svg' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#405fd3',
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays enabled: the layout works at any zoom level.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={dmSans.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <DemoBar />
        {children}
      </body>
    </html>
  );
}
