import type { Metadata } from 'next';
import Link from 'next/link';

import { requireRole } from '@/lib/auth';
import { brl, statusLabel } from '@/lib/public-store';
import { readMyOrders } from '@/lib/public-store-server';

import '@/app/escola/escola.css';

export const metadata: Metadata = { title: 'Meus pedidos', referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

/** Pedidos feitos nas lojas das escolas, estando logado. my_orders já filtra pelo próprio aluno no banco. */
export default async function MyOrdersPage() {
  await requireRole(['student'], '/aluno/pedidos');
  const orders = await readMyOrders();
  return (
    <section className="escola" style={{ minHeight: 0, background: 'transparent', padding: '8px 0 96px' }}>
      <div className="wrap">
        <span className="eyebrow">Lojas das escolas</span>
        <h1>Meus pedidos</h1>
        <p className="lead">Pedidos feitos com a sua conta. Pedidos sem conta ficam só no link recebido.</p>
        <div style={{ marginTop: 16 }}>
          {orders.length === 0 && <div className="card"><p className="muted">Você ainda não fez pedidos.</p></div>}
          {orders.map((o) => (
            <Link key={o.number} href={`/escola/pedido/${encodeURIComponent(o.number)}`} className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
              <div className="row"><h3>{o.store_name}</h3><span className="price">{brl(o.total_cents)}</span></div>
              <p className="muted">{o.number} · {statusLabel(o.status)} · {new Date(o.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })}</p>
            </Link>
          ))}
        </div>
        <p style={{ marginTop: 16 }}><Link className="btn ghost" href="/escola">Ver escolas</Link></p>
      </div>
    </section>
  );
}
