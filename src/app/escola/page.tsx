import Link from 'next/link';

import { readStoreList } from '@/lib/public-store-server';

export const dynamic = 'force-dynamic';

export default async function EscolasPage() {
  const stores = await readStoreList();
  return (
    <>
      <span className="eyebrow">Escolas parceiras</span>
      <h1>Escolha sua escola</h1>
      <p className="lead">Veja aulas, produtos e aluguel. Você faz o pedido e a escola confirma com você. Nada é cobrado aqui.</p>
      <div style={{ marginTop: 18 }}>
        {stores.length === 0 && <div className="card"><p className="muted">Nenhuma escola publicou a loja ainda.</p></div>}
        {stores.map((s) => (
          <Link key={s.slug} href={`/escola/${s.slug}`} className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
            <h3>{s.name}</h3>
            {s.slogan && <p className="muted">{s.slogan}</p>}
            {s.cities.length > 0 && <p className="muted">{s.cities.join(' · ')}</p>}
          </Link>
        ))}
      </div>
    </>
  );
}
