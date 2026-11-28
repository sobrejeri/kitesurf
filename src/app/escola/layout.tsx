import './escola.css';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Escolas de kitesurf',
  description: 'Aulas, produtos e aluguel das escolas de kitesurf parceiras.',
  referrer: 'no-referrer', // o link do pedido carrega um token: nunca vaza por Referer
};

export default function EscolaLayout({ children }: { children: React.ReactNode }) {
  return <main className="escola"><div className="wrap">{children}</div></main>;
}
