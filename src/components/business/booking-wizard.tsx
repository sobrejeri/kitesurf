'use client';

import { useMemo, useState } from 'react';

import { Badge, Button, Field, Note, inputClass } from '@/components/ui';
import { UNITS, UNIT_SERVICES } from '@/lib/business/demo';
import { availableSlots, bookingPrice, currentContext, validateBooking } from '@/lib/business/bookings';
import { dayLabel, endTime, instructorName } from '@/lib/business/rules';
import { serviceOf } from '@/lib/business/services';
import { formatMoney } from '@/lib/format';

export interface WizardInitial { unitId: string; serviceId: string; instructorId: string; name: string; bookingId?: string; code?: string }

/** Unit, service, instructor, day and time, then the customer. Validates like the real flow; saving is off in the demo. */
export function BookingWizard({ defaultUnit, initial }: { defaultUnit: string; initial?: WizardInitial }) {
  const ctx = useMemo(() => currentContext(), []);
  const units = UNITS.filter((u) => u.active);
  const [unitId, setUnitId] = useState(initial?.unitId ?? units.find((u) => u.id === defaultUnit)?.id ?? '');
  const [serviceId, setServiceId] = useState(initial?.serviceId ?? '');
  const [instructorId, setInstructorId] = useState(initial?.instructorId ?? '');
  const [dayOffset, setDayOffset] = useState(1);
  const [start, setStart] = useState('');
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const configs = UNIT_SERVICES.filter((u) => u.unitId === unitId);
  const config = configs.find((c) => c.serviceId === serviceId);
  const service = serviceOf(serviceId);
  const slots = unitId && serviceId && instructorId ? availableSlots({ unitId, serviceId, instructorId, dayOffset, ignoreBookingId: initial?.bookingId }, ctx) : [];
  const touch = () => setDone(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = validateBooking({ unitId, serviceId, instructorId, dayOffset, start, name, phone, ignoreBookingId: initial?.bookingId }, ctx);
    setErrors(next); setDone(Object.keys(next).length === 0);
  };
  const err = (k: string) => (errors[k] ? <span role="alert" className="text-[12px] text-danger">{errors[k]}</span> : null);

  return (
    <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-4 rounded-[16px] border border-line bg-surface p-4 shadow-card sm:p-5">
        {initial?.bookingId ? <Note title={`Alterando a reserva ${initial.code}`}>Escolha o novo dia e horário. O horário atual desta reserva fica livre para a nova escolha.</Note> : null}
        <Field label="1. Unidade">
          <select value={unitId} onChange={(e) => { touch(); setUnitId(e.target.value); setServiceId(''); setInstructorId(''); setStart(''); }} className={inputClass} aria-invalid={Boolean(errors.unitId)}>
            <option value="">Selecione</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.city}</option>)}
          </select>{err('unitId')}
        </Field>
        <Field label="2. Serviço">
          <select value={serviceId} disabled={!unitId} onChange={(e) => { touch(); setServiceId(e.target.value); setInstructorId(''); setStart(''); }} className={inputClass} aria-invalid={Boolean(errors.serviceId)}>
            <option value="">{unitId ? 'Selecione' : 'Escolha a unidade primeiro'}</option>
            {configs.map((c) => <option key={c.serviceId} value={c.serviceId}>{serviceOf(c.serviceId)?.name} · {formatMoney(bookingPrice(unitId, c.serviceId))}</option>)}
          </select>{err('serviceId')}
        </Field>
        <Field label="3. Instrutor">
          <select value={instructorId} disabled={!config} onChange={(e) => { touch(); setInstructorId(e.target.value); setStart(''); }} className={inputClass} aria-invalid={Boolean(errors.instructorId)}>
            <option value="">{config ? 'Selecione' : 'Escolha o serviço primeiro'}</option>
            {config?.instructorIds.map((id) => <option key={id} value={id}>{instructorName(id)}</option>)}
          </select>{err('instructorId')}
        </Field>
        <Field label="4. Dia">
          <select value={dayOffset} onChange={(e) => { touch(); setDayOffset(Number(e.target.value)); setStart(''); }} className={inputClass}>
            {Array.from({ length: 14 }, (_, d) => <option key={d} value={d}>{dayLabel(d)}{d === 0 ? ' · hoje' : ''}</option>)}
          </select>
        </Field>
        <fieldset className="grid gap-2">
          <legend className="text-[13px] font-medium text-ink">5. Horário{service ? ` (${service.minutes} min)` : ''}</legend>
          {!instructorId ? <p className="text-[13px] text-muted">Escolha unidade, serviço e instrutor para ver os horários livres.</p>
            : slots.length === 0 ? <p role="status" className="rounded-[12px] border border-dashed border-line-ghost p-3 text-[13px] text-muted">Sem horários livres neste dia (a agenda do instrutor vale para todas as unidades e escolas).</p>
            : <div className="flex flex-wrap gap-2">{slots.map((s) => (
              <label key={s} className={`press cursor-pointer rounded-full border px-3.5 py-2 text-[13px] font-semibold ${start === s ? 'border-brand bg-brand text-on-brand' : 'border-line-ghost text-ink hover:bg-brand-wash'}`}>
                <input type="radio" name="start" value={s} checked={start === s} onChange={() => { touch(); setStart(s); }} className="sr-only" />{s}
              </label>))}</div>}
          {err('start')}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do cliente"><input value={name} onChange={(e) => { touch(); setName(e.target.value); }} className={inputClass} aria-invalid={Boolean(errors.name)} autoComplete="off" />{err('name')}</Field>
          <Field label="Telefone com DDD"><input value={phone} onChange={(e) => { touch(); setPhone(e.target.value); }} inputMode="tel" className={inputClass} aria-invalid={Boolean(errors.phone)} placeholder="(88) 99999-9999" autoComplete="off" />{err('phone')}</Field>
        </div>
      </div>

      <aside className="grid content-start gap-3 rounded-[16px] border border-line bg-surface p-4 shadow-card lg:sticky lg:top-24">
        <h2 className="text-[15px] font-semibold text-ink">Resumo</h2>
        <dl className="grid gap-1.5 text-[13px]">
          <div className="flex justify-between gap-3"><dt className="text-muted">Serviço</dt><dd className="text-right text-ink">{service?.name ?? '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Quando</dt><dd className="text-right text-ink">{start && service ? `${dayLabel(dayOffset)}, ${start}–${endTime(start, service.minutes)}` : '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Instrutor</dt><dd className="text-right text-ink">{instructorId ? instructorName(instructorId) : '—'}</dd></div>
          <div className="flex justify-between gap-3 border-t border-line pt-2"><dt className="font-semibold text-ink">Valor</dt><dd className="tabular text-right text-[16px] font-bold text-ink">{unitId && serviceId ? formatMoney(bookingPrice(unitId, serviceId)) : '—'}</dd></div>
        </dl>
        <Badge tone="brand">Reserva presencial · sem taxa da plataforma</Badge>
        <p className="text-[12px] text-muted">O pagamento é combinado no balcão e não é confirmado por esta tela.</p>
        {done ? <Note icon="check">Reserva válida. Gravação desativada na demonstração: ela será ligada com o esquema do Business.</Note> : null}
        <Button type="submit">Validar reserva</Button>
      </aside>
    </form>
  );
}
