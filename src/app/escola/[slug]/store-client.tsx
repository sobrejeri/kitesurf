'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { loadFreeSlots, placePublicOrder } from '@/app/actions/public-store';
import { MAX_CART_ITEMS, MAX_QTY, RENTAL_HOUR_OPTIONS, brl, minutesLabel, rentalName, sanitizeCart, setLineQty, type CartLine, type StoreCatalog, type StoreService } from '@/lib/public-store';

const addDays = (n: number): string => new Date(Date.now() - 3 * 3600_000 + n * 86400_000).toISOString().slice(0, 10); // dia em Fortaleza (UTC-3)

export function StoreClient({ catalog }: { catalog: StoreCatalog }) {
  const slug = catalog.store.slug;
  const storageKey = `vento-cart:${slug}`;
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submissionLocked = useRef(false);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [coupon, setCoupon] = useState('');
  const unitName = (id: string) => catalog.units.find((u) => u.id === id)?.name ?? '';

  // O carrinho guarda só escolhas, nunca valores. sessionStorage pode falhar (aba privada): a loja funciona sem ele.
  useEffect(() => {
    try { const raw = sessionStorage.getItem(storageKey); if (raw) setCart(sanitizeCart(JSON.parse(raw))); } catch { /* sem armazenamento ou conteúdo inválido */ }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => { if (loaded) { try { sessionStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* sem armazenamento */ } } }, [cart, loaded, storageKey]);

  const add = (line: CartLine) => {
    setError(null);
    setCart((c) => (c.length >= MAX_CART_ITEMS ? c : [...c.filter((x) => x.key !== line.key), line]));
  };
  const remove = (key: string) => setCart((c) => c.filter((x) => x.key !== key));
  const changeQty = (key: string, qty: number) => setCart((c) => setLineQty(c, key, qty));

  function submit() {
    if (submissionLocked.current) return;
    submissionLocked.current = true;
    setError(null);
    start(async () => {
      try {
        const items = cart.map((l) => l.kind === 'lesson'
          ? { kind: 'lesson' as const, unit_id: l.unit_id, service_id: l.service_id, instructor_id: l.instructor_id, starts_at: l.starts_at }
          : l.kind === 'product'
            ? { kind: 'product' as const, unit_id: l.unit_id, product_id: l.product_id, qty: l.qty }
            : { kind: 'rental' as const, unit_id: l.unit_id, type: l.type, hours: l.hours, qty: l.qty });
        const res = await placePublicOrder({ slug, customer, phone, items, coupon: coupon || undefined });
        if (!res.ok) { submissionLocked.current = false; setError(res.error); return; }
        try { sessionStorage.removeItem(storageKey); } catch { /* ok */ }
        router.push(`/escola/pedido/${encodeURIComponent(res.number)}?t=${encodeURIComponent(res.token)}`);
      } catch {
        // The order may have been saved even if the response was lost. Keep
        // this submission blocked until its outcome is checked with the school.
        setError('Não foi possível confirmar o pedido. Fale com a escola antes de tentar novamente.');
      }
    });
  }

  return (
    <>
      {catalog.services.length > 0 && <h2>Aulas</h2>}
      {catalog.services.map((s) => <LessonCard key={s.id} slug={slug} service={s} units={catalog.units} onAdd={add} />)}

      {catalog.products.length > 0 && <h2>Produtos</h2>}
      {catalog.products.map((p) => (
        <div className="card" key={p.id}>
          <div className="row"><h3>{p.name}</h3><span className="price">{brl(p.price_cents)}</span></div>
          {p.category && <p className="muted">{p.category}</p>}
          <div className="chips">
            {p.units.map((u) => (
              <button key={u.unit_id} type="button" className="chip" disabled={!u.available}
                onClick={() => add({ key: `p:${p.id}:${u.unit_id}`, kind: 'product', unit_id: u.unit_id, product_id: p.id, qty: 1, label: `${p.name} · ${unitName(u.unit_id)}` })}>
                {unitName(u.unit_id)} {u.available ? '+ adicionar' : '(sem estoque)'}
              </button>
            ))}
          </div>
        </div>
      ))}

      {catalog.rentals.length > 0 && <h2>Aluguel</h2>}
      {catalog.rentals.map((r) => <RentalCard key={r.type} rental={r} unitName={unitName} onAdd={add} />)}

      {cart.length >= MAX_CART_ITEMS && <p className="err">Limite de {MAX_CART_ITEMS} itens por pedido.</p>}
      {catalog.store.whatsapp && <p className="muted" style={{ marginTop: 24 }}>Dúvidas? WhatsApp da escola: {catalog.store.whatsapp}</p>}

      {cart.length > 0 && !checkout && (
        <div className="bar"><div className="wrap">
          <span><strong>{cart.length}</strong> {cart.length === 1 ? 'item' : 'itens'} no pedido</span>
          <button className="btn" type="button" onClick={() => setCheckout(true)}>Revisar pedido</button>
        </div></div>
      )}

      {checkout && (
        <section className="card" style={{ marginTop: 24 }} aria-label="Finalizar pedido">
          <h3>Seu pedido</h3>
          {cart.map((l) => (
            <div className="line" key={l.key} style={{ flexWrap: 'wrap', alignItems: 'center' }}><span style={{ flex: '1 1 100%' }}>{l.label}{l.kind === 'rental' ? ` · ${l.hours}h` : ''}{l.kind !== 'lesson' && l.qty > 1 ? ` · ${l.qty}x` : ''}</span>
              <span style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                {l.kind !== 'lesson' && (
                  <>
                    <button type="button" className="btn ghost" style={{ padding: '4px 12px' }} aria-label={`Diminuir a quantidade de ${l.label}`} disabled={l.qty <= 1} onClick={() => changeQty(l.key, l.qty - 1)}>−</button>
                    <button type="button" className="btn ghost" style={{ padding: '4px 12px' }} aria-label={`Aumentar a quantidade de ${l.label}`} disabled={l.qty >= MAX_QTY} onClick={() => changeQty(l.key, l.qty + 1)}>+</button>
                  </>
                )}
                <button type="button" className="btn danger" style={{ padding: '4px 10px' }} onClick={() => remove(l.key)}>Remover</button>
              </span></div>
          ))}
          <p className="muted" style={{ marginTop: 10 }}>O valor final é calculado pela escola ao enviar e aparece no seu pedido. Nada é cobrado agora: o pagamento é combinado direto com a escola.</p>
          <label htmlFor="c-name">Seu nome</label>
          <input id="c-name" value={customer} onChange={(e) => setCustomer(e.target.value)} autoComplete="name" maxLength={80} />
          <label htmlFor="c-phone">WhatsApp com DDD</label>
          <input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} />
          <label htmlFor="c-coupon">Cupom (só com conta e e-mail confirmado)</label>
          <input id="c-coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} maxLength={32} />
          {error && <p className="err" role="alert">{error}</p>}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn ghost" type="button" onClick={() => setCheckout(false)}>Voltar</button>
            <button className="btn" type="button" disabled={pending || submissionLocked.current || cart.length === 0} onClick={submit}>{pending ? 'Enviando…' : 'Enviar pedido'}</button>
          </div>
        </section>
      )}
    </>
  );
}

function LessonCard({ slug, service, units, onAdd }: { slug: string; service: StoreService; units: StoreCatalog['units']; onAdd: (l: CartLine) => void }) {
  const [unitId, setUnitId] = useState(service.units[0]?.unit_id ?? '');
  const su = service.units.find((u) => u.unit_id === unitId);
  const [instructor, setInstructor] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[] | null>(null);
  const [busy, start] = useTransition();
  const instructorId = su?.instructors.some((i) => i.id === instructor) ? instructor : (su?.instructors[0]?.id ?? '');

  useEffect(() => {
    setSlots(null);
    if (!unitId || !instructorId || !date) return;
    let alive = true;
    start(async () => { const r = await loadFreeSlots({ slug, unit: unitId, service: service.id, instructor: instructorId, date }); if (alive) setSlots(r); });
    return () => { alive = false; };
  }, [slug, unitId, instructorId, date, service.id]);

  if (!su) return null;
  const unit = units.find((u) => u.id === unitId);
  return (
    <div className="card">
      <div className="row"><h3>{service.name}</h3><span className="price">{brl(su.price_cents)}</span></div>
      <p className="muted">{minutesLabel(service.minutes)}{service.description ? ` · ${service.description}` : ''}</p>
      <label htmlFor={`u-${service.id}`}>Unidade</label>
      <select id={`u-${service.id}`} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
        {service.units.map((u) => <option key={u.unit_id} value={u.unit_id}>{units.find((x) => x.id === u.unit_id)?.name}</option>)}
      </select>
      <label htmlFor={`i-${service.id}`}>Instrutor</label>
      <select id={`i-${service.id}`} value={instructorId} onChange={(e) => setInstructor(e.target.value)}>
        {su.instructors.map((i) => <option key={i.id} value={i.id}>{i.first_name}</option>)}
      </select>
      <label htmlFor={`d-${service.id}`}>Dia</label>
      <input id={`d-${service.id}`} type="date" min={addDays(1)} max={addDays(60)} value={date} onChange={(e) => setDate(e.target.value)} />
      {date && (
        <div className="chips" aria-live="polite">
          {busy || slots === null ? <span className="muted">Buscando horários…</span>
            : slots.length === 0 ? <span className="muted">Sem horários livres nesse dia.</span>
              : slots.map((t) => (
                <button key={t} type="button" className="chip"
                  onClick={() => onAdd({ key: `l:${service.id}:${unitId}:${instructorId}:${date}T${t}`, kind: 'lesson', unit_id: unitId, service_id: service.id, instructor_id: instructorId, starts_at: `${date}T${t}:00-03:00`,
                    label: `${service.name} · ${unit?.name ?? ''} · ${date.split('-').reverse().join('/')} ${t}` })}>{t}</button>
              ))}
        </div>
      )}
    </div>
  );
}

function RentalCard({ rental, unitName, onAdd }: { rental: StoreCatalog['rentals'][number]; unitName: (id: string) => string; onAdd: (l: CartLine) => void }) {
  const [hours, setHours] = useState(1);
  const total = useMemo(() => rental.cents_per_hour * hours, [rental.cents_per_hour, hours]);
  return (
    <div className="card">
      <div className="row"><h3>{rentalName(rental.type)}</h3><span className="price">{brl(rental.cents_per_hour)}/h</span></div>
      <label htmlFor={`h-${rental.type}`}>Horas</label>
      <select id={`h-${rental.type}`} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
        {RENTAL_HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}h</option>)}
      </select>
      <p className="muted">Estimativa: {brl(total)} (o valor final vem do pedido)</p>
      <div className="chips">
        {rental.units.map((u) => (
          <button key={u.unit_id} type="button" className="chip" disabled={u.available < 1}
            onClick={() => onAdd({ key: `r:${rental.type}:${u.unit_id}`, kind: 'rental', unit_id: u.unit_id, type: rental.type, hours, qty: 1, label: `Aluguel de ${rentalName(rental.type)} · ${unitName(u.unit_id)}` })}>
            {unitName(u.unit_id)} {u.available > 0 ? '+ adicionar' : '(indisponível)'}
          </button>
        ))}
      </div>
    </div>
  );
}
