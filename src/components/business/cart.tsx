'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { Button, Field, Note, inputClass } from '@/components/ui';
import { UNITS, UNIT_SERVICES, type CartItem, type EquipmentType } from '@/lib/business/demo';
import { availableSlots, currentContext } from '@/lib/business/bookings';
import { dayLabel, instructorName } from '@/lib/business/rules';
import { effectivePriceCents, serviceOf } from '@/lib/business/services';
import { ACCENT, applyCoupon, itemQuantity, itemTitle, lineCents, rentalAvailable, splitByUnit, subtotalCents, validateCoupon, validateCustomer, validateItem, validateStore } from '@/lib/business/shop';
import { HOURLY_CENTS, TYPE_LABEL, productStock, rentalPrice } from '@/lib/business/stock';
import { STORE } from '@/lib/business/demo';
import { formatMoney } from '@/lib/format';

const KEY = 'vento:business:cart';
interface CartApi { items: CartItem[]; coupon: string; add: (i: CartItem) => string | null; remove: (id: string) => void; setCoupon: (c: string) => void; clear: () => void }
const Ctx = createContext<CartApi | null>(null);
const useCart = (): CartApi => { const c = useContext(Ctx); if (!c) throw new Error('CartProvider ausente'); return c; };

/** The demo cart lives only in this browser tab (sessionStorage). It holds choices; prices are recomputed on every render. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]); const [coupon, setCouponState] = useState(''); const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { items?: CartItem[]; coupon?: string } | null; if (raw?.items) setItems(raw.items.filter((i) => !validateItem(i, raw.items?.filter((x) => x.id !== i.id) ?? []))); if (raw?.coupon) setCouponState(raw.coupon); } catch { /* sem armazenamento: o carrinho começa vazio */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) try { sessionStorage.setItem(KEY, JSON.stringify({ items, coupon })); } catch { /* ignorado */ } }, [items, coupon, ready]);
  const add = useCallback((i: CartItem) => { const err = validateItem(i, items); if (err) return err; setItems((cur) => [...cur, i]); return null; }, [items]);
  const api = useMemo<CartApi>(() => ({ items, coupon, add, remove: (id) => setItems((c) => c.filter((x) => x.id !== id)), setCoupon: setCouponState, clear: () => { setItems([]); setCouponState(''); } }), [items, coupon, add]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function CartLink() {
  const { items } = useCart(); const n = items.reduce((s, i) => s + itemQuantity(i), 0);
  return <Link href="/admin/business/lojinha/vitrine/carrinho" className="press inline-flex min-h-9 items-center rounded-full border border-line-ghost px-3.5 text-[13px] font-semibold text-brand">Carrinho ({n})</Link>;
}

let seq = 0; const newId = () => `c${Date.now().toString(36)}${seq++}`;
const unitOptions = (ids: readonly string[]) => UNITS.filter((u) => u.active && ids.includes(u.id));
const Added = ({ msg }: { msg: string }) => <Note icon="check">{msg} <Link href="/admin/business/lojinha/vitrine/carrinho" className="font-semibold text-brand underline">Ver carrinho</Link></Note>;

export function AddLessonForm({ serviceId }: { serviceId: string }) {
  const { add } = useCart(); const ctx = useMemo(() => currentContext(), []);
  const configs = UNIT_SERVICES.filter((c) => c.serviceId === serviceId); const service = serviceOf(serviceId);
  const [unitId, setUnit] = useState(''); const [instructorId, setInst] = useState(''); const [dayOffset, setDay] = useState(1); const [start, setStart] = useState(''); const [people, setPeople] = useState('1');
  const [error, setError] = useState(''); const [done, setDone] = useState(false);
  const config = configs.find((c) => c.unitId === unitId);
  const slots = unitId && instructorId ? availableSlots({ unitId, serviceId, instructorId, dayOffset }, ctx) : [];
  const price = service && config ? effectivePriceCents(service, config) : 0;
  const touch = () => { setDone(false); setError(''); };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); const err = validateItem({ id: 'x', kind: 'lesson', serviceId, unitId, instructorId, dayOffset, start, people: Number(people) }) ?? null; if (err) { setError(err); setDone(false); return; } const r = add({ id: newId(), kind: 'lesson', serviceId, unitId, instructorId, dayOffset, start, people: Number(people) }); setError(r ?? ''); setDone(!r); }} className="grid gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2">
      <Field label="Unidade"><select value={unitId} onChange={(e) => { touch(); setUnit(e.target.value); setInst(''); setStart(''); }} className={inputClass}><option value="">Selecione</option>{unitOptions(configs.map((c) => c.unitId)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label="Instrutor"><select value={instructorId} onChange={(e) => { touch(); setInst(e.target.value); setStart(''); }} disabled={!config} className={inputClass}><option value="">Selecione</option>{config?.instructorIds.map((i) => <option key={i} value={i}>{instructorName(i)}</option>)}</select></Field>
      <Field label="Dia"><select value={dayOffset} onChange={(e) => { touch(); setDay(Number(e.target.value)); setStart(''); }} className={inputClass}>{Array.from({ length: 14 }, (_, i) => i + 1).map((o) => <option key={o} value={o}>{dayLabel(o)}</option>)}</select></Field>
      <Field label="Horário"><select value={start} onChange={(e) => { touch(); setStart(e.target.value); }} disabled={slots.length === 0} className={inputClass}><option value="">{unitId && instructorId ? (slots.length ? 'Selecione' : 'Sem horário livre neste dia') : 'Escolha unidade e instrutor'}</option>{slots.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
      <Field label={`Alunos (até ${service?.capacity ?? 1})`}><input value={people} onChange={(e) => { touch(); setPeople(e.target.value); }} inputMode="numeric" className={inputClass} /></Field>
      <div className="grid content-end gap-2 sm:col-span-2">
        {price > 0 ? <p className="text-[12.5px] text-muted">{formatMoney(price)} por aluno nesta unidade.</p> : null}
        {error ? <span role="alert" className="text-[12.5px] text-danger">{error}</span> : null}{done ? <Added msg="Aula adicionada." /> : null}
        <Button type="submit" className="justify-self-start">Adicionar ao carrinho</Button>
      </div>
    </form>
  );
}

export function AddProductForm({ productId }: { productId: string }) {
  const { add } = useCart(); const [unitId, setUnit] = useState(''); const [qty, setQty] = useState('1'); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  const stocked = UNITS.filter((u) => u.active && productStock(productId, u.id) > 0);
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); const r = add({ id: newId(), kind: 'product', productId, unitId, qty: Number(qty) }); setError(r ?? ''); setDone(!r); }} className="grid gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2">
      <Field label="Retirar na unidade"><select value={unitId} onChange={(e) => { setDone(false); setError(''); setUnit(e.target.value); }} className={inputClass}><option value="">Selecione</option>{stocked.map((u) => <option key={u.id} value={u.id}>{u.name} ({productStock(productId, u.id)} disponíveis)</option>)}</select></Field>
      <Field label="Quantidade"><input value={qty} onChange={(e) => { setDone(false); setQty(e.target.value); }} inputMode="numeric" className={inputClass} /></Field>
      <div className="grid gap-2 sm:col-span-2">{error ? <span role="alert" className="text-[12.5px] text-danger">{error}</span> : null}{done ? <Added msg="Produto adicionado." /> : null}<Button type="submit" className="justify-self-start">Adicionar ao carrinho</Button></div>
    </form>
  );
}

export function AddRentalForm({ type }: { type: EquipmentType }) {
  const { add } = useCart(); const [unitId, setUnit] = useState(''); const [hours, setHours] = useState('2'); const [qty, setQty] = useState('1'); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  const free = UNITS.filter((u) => u.active && rentalAvailable(type, u.id) > 0); const h = Number(hours);
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); const r = add({ id: newId(), kind: 'rental', type, unitId, hours: h, qty: Number(qty) }); setError(r ?? ''); setDone(!r); }} className="grid gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-3">
      <Field label="Unidade"><select value={unitId} onChange={(e) => { setDone(false); setError(''); setUnit(e.target.value); }} className={inputClass}><option value="">Selecione</option>{free.map((u) => <option key={u.id} value={u.id}>{u.name} ({rentalAvailable(type, u.id)} livres)</option>)}</select></Field>
      <Field label="Horas (1 a 8)"><input value={hours} onChange={(e) => { setDone(false); setHours(e.target.value); }} inputMode="numeric" className={inputClass} /></Field>
      <Field label="Quantidade"><input value={qty} onChange={(e) => { setDone(false); setQty(e.target.value); }} inputMode="numeric" className={inputClass} /></Field>
      <div className="grid gap-2 sm:col-span-3">
        {Number.isInteger(h) && h >= 1 && h <= 8 ? <p className="text-[12.5px] text-muted">{formatMoney(rentalPrice(type, h))} por unidade ({formatMoney(HOURLY_CENTS[type])} por hora).</p> : null}
        {error ? <span role="alert" className="text-[12.5px] text-danger">{error}</span> : null}{done ? <Added msg="Aluguel adicionado." /> : null}
        <Button type="submit" className="justify-self-start">Adicionar ao carrinho</Button>
      </div>
    </form>
  );
}

function describe(i: CartItem): string {
  const unit = UNITS.find((u) => u.id === i.unitId)?.name ?? '';
  if (i.kind === 'lesson') return `${unit} · ${instructorName(i.instructorId)} · ${dayLabel(i.dayOffset)}, ${i.start} · ${i.people} aluno(s)`;
  if (i.kind === 'product') return `${unit} · ${i.qty} un. · retirada na unidade`;
  return `${unit} · ${i.qty} × ${TYPE_LABEL[i.type]} · ${i.hours} h`;
}

export function CartSummary({ editable }: { editable: boolean }) {
  const { items, coupon, setCoupon, remove } = useCart(); const [typed, setTyped] = useState(coupon);
  const result = coupon ? applyCoupon(coupon, items) : null; const discount = result?.ok ? result.discountCents : 0;
  const groups = splitByUnit(items, result?.coupon, discount); const sub = subtotalCents(items);
  if (items.length === 0) return <Note tone="brand" title="Carrinho vazio">Adicione aulas, produtos ou aluguéis pelo catálogo.</Note>;
  return (
    <div className="grid gap-4">
      {groups.map((g) => (
        <section key={g.unitId} aria-label={UNITS.find((u) => u.id === g.unitId)?.name} className="rounded-[16px] border border-line bg-surface p-4 shadow-card">
          <h2 className="text-[15px] font-semibold text-ink">{UNITS.find((u) => u.id === g.unitId)?.name}</h2>
          <ul className="mt-2 divide-y divide-line">{g.items.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 py-2.5 text-[13px]">
              <div className="min-w-0"><p className="font-semibold text-ink">{itemTitle(i)}</p><p className="text-muted">{describe(i)}</p>{editable ? <button type="button" onClick={() => remove(i.id)} className="mt-1 text-[12.5px] font-semibold text-danger">Remover</button> : null}</div>
              <span className="tabular shrink-0 font-semibold text-ink">{formatMoney(lineCents(i))}</span>
            </li>))}</ul>
          <p className="tabular mt-2 flex justify-between border-t border-line pt-2 text-[13px] text-muted"><span>Pedido desta unidade{g.discountCents ? ` (desconto ${formatMoney(g.discountCents)})` : ''}</span><span className="font-semibold text-ink">{formatMoney(g.totalCents)}</span></p>
        </section>))}
      {groups.length > 1 ? <Note tone="brand" title="Pedidos separados por unidade">Itens de unidades diferentes viram pedidos operacionais separados, cada um atendido pela sua unidade.</Note> : null}
      {editable ? (
        <form noValidate onSubmit={(e) => { e.preventDefault(); setCoupon(typed.trim().toUpperCase()); }} className="flex flex-wrap items-end gap-2 rounded-[16px] border border-line bg-surface p-4 shadow-card">
          <div className="min-w-[10rem] flex-1"><Field label="Cupom"><input value={typed} onChange={(e) => setTyped(e.target.value)} className={inputClass} autoComplete="off" /></Field></div>
          <Button type="submit" variant="ghost">Aplicar</Button>
        </form>) : null}
      {result && !result.ok ? <span role="alert" className="text-[12.5px] text-danger">{result.error}</span> : null}
      <dl className="tabular grid gap-1 rounded-[16px] border border-line bg-surface p-4 text-[14px] shadow-card">
        <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatMoney(sub)}</dd></div>
        {discount ? <div className="flex justify-between"><dt className="text-muted">Cupom {result?.coupon?.code}</dt><dd>− {formatMoney(discount)}</dd></div> : null}
        <div className="flex justify-between text-[16px] font-bold"><dt>Total do pedido</dt><dd>{formatMoney(sub - discount)}</dd></div>
      </dl>
    </div>
  );
}

export function CartActions() {
  const { items } = useCart();
  return items.length ? <Link href="/admin/business/lojinha/vitrine/resumo" className="press inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-[14px] font-semibold text-on-brand">Revisar pedido</Link> : null;
}

export function OrderRequestForm() {
  const { items, clear } = useCart(); const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [errors, setErrors] = useState<Record<string, string>>({}); const [sent, setSent] = useState(false);
  if (sent) return <Note icon="check" title="Pedido validado (demonstração)">Nenhum pedido foi criado e nada foi cobrado. Quando o módulo estiver ligado, a escola receberá o pedido e combinará o pagamento diretamente com você.</Note>;
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); const n = validateCustomer({ name, phone }); const bad = items.find((i) => validateItem(i, items.filter((x) => x.id !== i.id))); if (bad) n.items = 'Um item do carrinho não está mais disponível. Revise o carrinho.'; setErrors(n); if (Object.keys(n).length === 0 && items.length) { setSent(true); clear(); } }} className="grid max-w-xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card">
      <Field label="Seu nome"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="off" />{errors.name ? <span role="alert" className="text-[12px] text-danger">{errors.name}</span> : null}</Field>
      <Field label="Telefone com DDD"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputClass} autoComplete="off" />{errors.phone ? <span role="alert" className="text-[12px] text-danger">{errors.phone}</span> : null}</Field>
      <p className="text-[12.5px] text-muted">O pagamento não acontece aqui: a escola combina diretamente com você. Este pedido não confirma pagamento algum.</p>
      {errors.items ? <span role="alert" className="text-[12.5px] text-danger">{errors.items}</span> : null}
      {items.length === 0 ? <Note tone="brand">O carrinho está vazio.</Note> : null}
      <Button type="submit" disabled={items.length === 0} className="justify-self-start">Enviar pedido (demonstração)</Button>
    </form>
  );
}

export function StoreForm() {
  const [v, setV] = useState({ name: STORE.name, slogan: STORE.slogan, whatsapp: STORE.whatsapp, accent: STORE.accent as string }); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const set = (k: keyof typeof v) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setDone(false); setV({ ...v, [k]: x.target.value }); };
  const accent = ACCENT[v.accent as keyof typeof ACCENT] ?? ACCENT.azul;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateStore(v); setE(n); setDone(Object.keys(n).length === 0); }} className="grid gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card">
        <Field label="Nome da loja"><input value={v.name} onChange={set('name')} className={inputClass} />{e.name ? <span role="alert" className="text-[12px] text-danger">{e.name}</span> : null}</Field>
        <Field label="Frase de apresentação"><input value={v.slogan} onChange={set('slogan')} className={inputClass} />{e.slogan ? <span role="alert" className="text-[12px] text-danger">{e.slogan}</span> : null}</Field>
        <Field label="WhatsApp com DDD"><input value={v.whatsapp} onChange={set('whatsapp')} inputMode="tel" className={inputClass} />{e.whatsapp ? <span role="alert" className="text-[12px] text-danger">{e.whatsapp}</span> : null}</Field>
        <Field label="Cor de destaque"><select value={v.accent} onChange={set('accent')} className={inputClass}>{Object.entries(ACCENT).map(([id, a]) => <option key={id} value={id}>{a.label}</option>)}</select></Field>
        {done ? <Note icon="check">Dados válidos. Gravação desativada na demonstração: ela será ligada quando as tabelas do Business forem aprovadas.</Note> : null}
        <Button type="submit" className="justify-self-start">Validar personalização</Button>
      </form>
      <div aria-label="Prévia" className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-card">
        <div style={{ background: accent.bg, color: accent.fg }} className="p-5"><p className="text-[18px] font-bold">{v.name || 'Nome da loja'}</p><p className="mt-1 text-[13px] opacity-90">{v.slogan || 'Sua frase de apresentação'}</p></div>
        <div className="p-4 text-[13px] text-muted">Prévia da vitrine. A escolha da cor muda só o destaque: o resto segue a identidade do VentoKite.</div>
      </div>
    </div>
  );
}

export function CouponForm() {
  const [v, setV] = useState({ code: '', kind: 'percent', value: '', min: '', days: '30', maxUses: '100' }); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const set = (k: keyof typeof v) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setDone(false); setV({ ...v, [k]: x.target.value }); };
  const err = (k: string) => (e[k] ? <span role="alert" className="text-[12px] text-danger">{e[k]}</span> : null);
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validateCoupon(v); setE(n); setDone(Object.keys(n).length === 0); }} className="grid max-w-2xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2">
      <Field label="Código"><input value={v.code} onChange={set('code')} className={inputClass} autoComplete="off" />{err('code')}</Field>
      <Field label="Tipo"><select value={v.kind} onChange={set('kind')} className={inputClass}><option value="percent">Percentual</option><option value="fixed">Valor fixo</option></select>{err('kind')}</Field>
      <Field label={v.kind === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}><input value={v.value} onChange={set('value')} inputMode="decimal" className={inputClass} />{err('value')}</Field>
      <Field label="Valor mínimo do carrinho (R$)"><input value={v.min} onChange={set('min')} inputMode="decimal" className={inputClass} />{err('min')}</Field>
      <Field label="Validade (dias)"><input value={v.days} onChange={set('days')} inputMode="numeric" className={inputClass} />{err('days')}</Field>
      <Field label="Limite de usos"><input value={v.maxUses} onChange={set('maxUses')} inputMode="numeric" className={inputClass} />{err('maxUses')}</Field>
      <div className="grid gap-3 sm:col-span-2">{done ? <Note icon="check">Cupom válido. Gravação desativada na demonstração: ela será ligada quando as tabelas do Business forem aprovadas.</Note> : null}<Button type="submit" className="justify-self-start">Validar cupom</Button></div>
    </form>
  );
}
