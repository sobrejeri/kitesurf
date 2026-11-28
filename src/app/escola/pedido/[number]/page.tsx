import type { Metadata } from 'next';
import Link from 'next/link';

import { brl, statusLabel } from '@/lib/public-store';
import { readOrder } from '@/lib/public-store-server';

import { CancelForm } from './cancel-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Seu pedido', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const { number } = await params;
  const { t } = await searchParams;
  const token = typeof t === 'string' && /^[0-9a-f]{64}$/.test(t) ? t : null;
  const order = await readOrder(number, token);
  if (!order) {
    return (
      <>
        <h1>Pedido não encontrado</h1>
        <p className="lead">Confira o link que você recebeu. Se você tem conta, entre nela para ver seus pedidos.</p>
        <p style={{ marginTop: 16 }}><Link className="btn" href="/escola">Ver escolas</Link></p>
      </>
    );
  }
  return (
    <>
      <span className="eyebrow">Pedido {order.number}</span>
      <h1>{statusLabel(order.status)}</h1>
      <p className="lead">{order.store.name}. Guarde este link: é a única forma de acompanhar o pedido sem conta.</p>
      <div className="card" style={{ marginTop: 16 }}>
        {order.items.map((i, idx) => (
          <div className="line" key={idx}>
            <span>{i.name} · {i.unit}{i.starts_at ? ` · ${new Date(i.starts_at).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' })}` : ''}{i.hours ? ` · ${i.hours}h` : ''}{i.qty > 1 ? ` · ${i.qty}x` : ''}</span>
            <span>{brl(i.line_cents)}</span>
          </div>
        ))}
        {order.discount_cents > 0 && <div className="line"><span>Desconto</span><span>-{brl(order.discount_cents)}</span></div>}
        <div className="line"><strong>Total</strong><strong className="price">{brl(order.total_cents)}</strong></div>
      </div>
      <p className="muted">O pagamento é combinado direto com a escola. Este pedido ainda não reserva estoque nem horário até a escola confirmar.</p>
      {order.store.whatsapp && <p className="muted">WhatsApp da escola: {order.store.whatsapp}</p>}
      {order.cancellable && <CancelForm number={order.number} token={token} />}
    </>
  );
}
