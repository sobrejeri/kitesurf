'use client';

import { useState } from 'react';

import { Button, Field, Note, inputClass } from '@/components/ui';
import { EQUIPMENT, MAINTENANCE, PRODUCTS, RENTALS, UNITS } from '@/lib/business/demo';
import { CONDITION_LABEL, HOURLY_CENTS, STATUS_LABEL, TYPE_LABEL, equipmentStatus, productStock, rentalPrice, returnOutcome, validateEquipment, validateMaintenance, validateProduct, validateRental, validateReturn, validateStockMovement, validateTransfer } from '@/lib/business/stock';
import type { Condition } from '@/lib/business/demo';
import { formatMoney } from '@/lib/format';

const NOTE = 'Gravação desativada na demonstração: ela será ligada quando as tabelas do Business forem aprovadas.';
export type Option = readonly [string, string];
export interface FieldSpec { k: string; label: string; kind: 'text' | 'select'; options?: readonly Option[]; ph?: string; wide?: boolean; mode?: 'numeric' | 'decimal' }

export function Form({ fields, init, validate, submitLabel, hint, extra }: { fields: readonly FieldSpec[]; init: Record<string, string>; validate: (v: Record<string, string>) => Record<string, string>; submitLabel: string; hint?: (v: Record<string, string>) => React.ReactNode; extra?: (v: Record<string, string>) => string }) {
  const [v, setV] = useState(init); const [e, setE] = useState<Record<string, string>>({}); const [done, setDone] = useState(false);
  const set = (k: string) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setDone(false); setV({ ...v, [k]: x.target.value }); };
  return (
    <form noValidate onSubmit={(x) => { x.preventDefault(); const n = validate(v); setE(n); setDone(Object.keys(n).length === 0); }} className="grid max-w-2xl gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:grid-cols-2 sm:p-5">
      {fields.map((f) => (
        <div key={f.k} className={f.wide ? 'sm:col-span-2' : ''}>
          <Field label={f.label}>
            {f.kind === 'select'
              ? <select value={v[f.k] ?? ''} onChange={set(f.k)} className={inputClass} aria-invalid={Boolean(e[f.k])}><option value="">Selecione</option>{f.options?.map(([val, label]) => <option key={val} value={val}>{label}</option>)}</select>
              : <input value={v[f.k] ?? ''} onChange={set(f.k)} placeholder={f.ph} inputMode={f.mode} className={inputClass} aria-invalid={Boolean(e[f.k])} autoComplete="off" />}
            {e[f.k] ? <span role="alert" className="text-[12px] text-danger">{e[f.k]}</span> : null}
          </Field>
        </div>
      ))}
      <div className="grid gap-3 sm:col-span-2">
        {hint ? <div aria-live="polite" className="text-[12.5px] text-muted">{hint(v)}</div> : null}
        {done ? <Note icon="check">{extra ? extra(v) : 'Dados válidos.'} {NOTE}</Note> : null}
        <Button type="submit" className="justify-self-start">{submitLabel}</Button>
      </div>
    </form>
  );
}

/** Feeds the generic form's string map to a validator that expects its own named fields. */
export function adapt<T extends Record<string, string>>(fn: (i: T) => Record<string, string>, keys: readonly (keyof T & string)[]) {
  return (v: Record<string, string>) => fn(Object.fromEntries(keys.map((k) => [k, v[k] ?? ''])) as T);
}

const units = UNITS.filter((u) => u.active).map((u): Option => [u.id, u.name]);
const products = PRODUCTS.map((p): Option => [p.id, `${p.name} (${p.sku})`]);

export const ProductForm = () => <Form submitLabel="Validar produto" init={{ name: '', sku: '', price: '', min: '5' }} validate={adapt(validateProduct, ['name', 'sku', 'price', 'min'])}
  fields={[{ k: 'name', label: 'Nome', kind: 'text', wide: true }, { k: 'sku', label: 'Código (SKU)', kind: 'text', ph: 'CAM-02' }, { k: 'price', label: 'Preço (R$)', kind: 'text', mode: 'decimal', ph: '60,00' }, { k: 'min', label: 'Estoque mínimo', kind: 'text', mode: 'numeric' }]} />;

export const EquipmentForm = () => <Form submitLabel="Validar equipamento" init={{ code: '', type: '', unitId: '', condition: 'bom' }} validate={adapt(validateEquipment, ['code', 'type', 'unitId', 'condition'])}
  fields={[{ k: 'code', label: 'Código individual', kind: 'text', ph: 'PR-05' }, { k: 'type', label: 'Tipo', kind: 'select', options: Object.entries(TYPE_LABEL) }, { k: 'unitId', label: 'Unidade', kind: 'select', options: units }, { k: 'condition', label: 'Estado de conservação', kind: 'select', options: Object.entries(CONDITION_LABEL) }]}
  hint={(v) => { const t = v.type ?? ''; return t in HOURLY_CENTS ? `Aluguel: ${formatMoney(HOURLY_CENTS[t as keyof typeof HOURLY_CENTS])} por hora.` : null; }} />;

export const StockMovementForm = () => <Form submitLabel="Validar movimentação" init={{ productId: '', unitId: '', type: 'in', qty: '', note: '' }} validate={adapt(validateStockMovement, ['productId', 'unitId', 'type', 'qty', 'note'])}
  fields={[{ k: 'productId', label: 'Produto', kind: 'select', options: products }, { k: 'unitId', label: 'Unidade', kind: 'select', options: units }, { k: 'type', label: 'Tipo', kind: 'select', options: [['in', 'Entrada'], ['sale', 'Saída por venda'], ['adjust', 'Ajuste de contagem (+/−)']] }, { k: 'qty', label: 'Quantidade', kind: 'text', mode: 'numeric' }, { k: 'note', label: 'Motivo', kind: 'text', wide: true }]}
  hint={(v) => (v.productId && v.unitId ? `Em estoque agora: ${productStock(v.productId, v.unitId)}.` : null)} />;

export const TransferForm = () => <Form submitLabel="Validar transferência" init={{ productId: '', fromUnit: '', toUnit: '', qty: '' }} validate={adapt(validateTransfer, ['productId', 'fromUnit', 'toUnit', 'qty'])}
  fields={[{ k: 'productId', label: 'Produto', kind: 'select', options: products, wide: true }, { k: 'fromUnit', label: 'Sai da unidade', kind: 'select', options: units }, { k: 'toUnit', label: 'Chega na unidade', kind: 'select', options: units }, { k: 'qty', label: 'Quantidade', kind: 'text', mode: 'numeric' }]}
  hint={(v) => (v.productId && v.fromUnit ? `A origem tem ${productStock(v.productId, v.fromUnit)} em estoque.` : null)} extra={() => 'Transferência válida: saem da origem e entram no destino na mesma operação.'} />;

const available = EQUIPMENT.filter((q) => equipmentStatus(q) === 'available').map((q): Option => [q.id, `${q.code} · ${q.label} · ${UNITS.find((u) => u.id === q.unitId)?.name}`]);
export const RentalForm = () => <Form submitLabel="Validar aluguel" init={{ equipmentId: '', customer: '', hours: '2' }} validate={adapt((i: { equipmentId: string; customer: string; hours: string }) => validateRental(i), ['equipmentId', 'customer', 'hours'])}
  fields={[{ k: 'equipmentId', label: 'Equipamento disponível', kind: 'select', options: available, wide: true }, { k: 'customer', label: 'Cliente', kind: 'text' }, { k: 'hours', label: 'Horas (1 a 8)', kind: 'text', mode: 'numeric' }]}
  hint={(v) => { const q = EQUIPMENT.find((x) => x.id === v.equipmentId); return q && /^\d$/.test(v.hours ?? '') ? `Valor: ${formatMoney(rentalPrice(q.type, Number(v.hours)))}. O pagamento é combinado no balcão e não é confirmado por aqui.` : null; }} />;

const open = RENTALS.filter((r) => !r.returned).map((r): Option => { const q = EQUIPMENT.find((x) => x.id === r.equipmentId); return [r.id, `${q?.code} · ${r.customer}`]; });
export const ReturnForm = () => <Form submitLabel="Validar devolução" init={{ rentalId: '', condition: '', note: '' }} validate={adapt((i: { rentalId: string; condition: string; note: string }) => validateReturn(i), ['rentalId', 'condition', 'note'])}
  fields={[{ k: 'rentalId', label: 'Aluguel em andamento', kind: 'select', options: open, wide: true }, { k: 'condition', label: 'Estado em que voltou', kind: 'select', options: Object.entries(CONDITION_LABEL) }, { k: 'note', label: 'Observação (obrigatória se voltou pior)', kind: 'text' }]}
  hint={(v) => { const r = RENTALS.find((x) => x.id === v.rentalId); return r ? `Saiu em estado ${CONDITION_LABEL[r.conditionOut].toLowerCase()}.` : null; }}
  extra={(v) => ((v.condition ?? '') in CONDITION_LABEL && returnOutcome(v.condition as Condition) === 'maintenance' ? 'Devolução válida: o equipamento vai para a manutenção.' : 'Devolução válida: o equipamento volta a ficar disponível.')} />;

const usable = EQUIPMENT.filter((q) => !q.retired).map((q): Option => [q.id, `${q.code} · ${q.label} (${STATUS_LABEL[equipmentStatus(q)]})`]);
export const MaintenanceForm = () => <Form submitLabel="Validar manutenção" init={{ equipmentId: '', description: '' }} validate={adapt(validateMaintenance, ['equipmentId', 'description'])}
  fields={[{ k: 'equipmentId', label: 'Equipamento', kind: 'select', options: usable, wide: true }, { k: 'description', label: 'Problema', kind: 'text', wide: true }]}
  extra={() => `Manutenção válida: o equipamento fica indisponível para aluguel até concluir (${MAINTENANCE.filter((m) => m.status === 'open').length} aberta(s) hoje).`} />;
