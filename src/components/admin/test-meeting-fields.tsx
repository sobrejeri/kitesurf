'use client';

import { useState } from 'react';

import { inputClass } from '@/components/ui';

type Slot = { id: number; start: string; hours: number };

const MAX_MEETINGS = 4;
const MAX_TOTAL_HOURS = 8;

/** One form, one booking: add 1–4 independently scheduled meetings. */
export function AdminTestMeetingFields({
  suggestedDates,
  minDate,
  maxDate,
}: {
  suggestedDates: string[];
  minDate: string;
  maxDate: string;
}) {
  const [slots, setSlots] = useState<Slot[]>([
    { id: 0, start: suggestedDates[0], hours: 2 },
  ]);
  const total = slots.reduce((sum, slot) => sum + slot.hours, 0);

  function addMeeting() {
    if (slots.length >= MAX_MEETINGS) return;
    const id = Math.max(...slots.map((slot) => slot.id)) + 1;
    setSlots([...slots, {
      id,
      start: suggestedDates[Math.min(id, suggestedDates.length - 1)] ?? '',
      hours: 2,
    }]);
  }
  function patchSlot(id: number, update: Partial<Slot>) {
    setSlots((current) => current.map((slot) =>
      slot.id === id ? { ...slot, ...update } : slot));
  }
  function removeSlot(id: number) {
    setSlots((current) => current.length > 1
      ? current.filter((slot) => slot.id !== id)
      : current);
  }

  return (
    <fieldset className="rounded-[18px] border border-line p-3">
      <legend className="px-1 text-[14px] font-bold text-ink">
        Encontros desta reserva
      </legend>
      <p className="mt-1 text-[12px] text-muted">
        Escolha dias consecutivos ou alternados. Todos os encontros
        ficam vinculados à mesma reserva de demonstração.
      </p>

      <div className="mt-3 grid gap-3">
        {slots.map((slot, index) => (
          <div key={slot.id} className="rounded-[14px] border border-line bg-surface p-3">
            <div className="mb-3 flex items-center justify-between">
              <strong className="text-[13px] text-ink">Encontro {index + 1}</strong>
              {slots.length > 1 ? (
                <button type="button" onClick={() => removeSlot(slot.id)}
                  className="min-h-10 px-2 text-[12px] font-semibold text-brand">
                  Remover
                </button>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`test-start-${slot.id}`}
                  className="text-[12px] font-semibold text-label">
                  Data e horário (Ceará)
                </label>
                <input id={`test-start-${slot.id}`} name="meetingStart"
                  type="datetime-local" value={slot.start} required
                  min={minDate} max={maxDate}
                  onChange={(value) => patchSlot(slot.id, {
                    start: value.currentTarget.value,
                  })}
                  className={inputClass + ' mt-1 [color-scheme:dark]'} />
              </div>
              <div>
                <label htmlFor={`test-hours-${slot.id}`}
                  className="text-[12px] font-semibold text-label">
                  Duração
                </label>
                <select id={`test-hours-${slot.id}`} name="meetingHours"
                  value={slot.hours} className={inputClass + ' mt-1'}
                  onChange={(event) => patchSlot(slot.id, {
                    hours: Number(event.target.value),
                  })}>
                  {[1,2,3,4,5,6,7,8].map((n) =>
                    <option key={n} value={n}>{n}h</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={addMeeting}
          disabled={slots.length >= MAX_MEETINGS}
          className="min-h-11 rounded-full border border-brand px-4 py-2 text-[13px] font-bold text-brand disabled:cursor-not-allowed disabled:opacity-40">
          + Adicionar encontro
        </button>
        <span className={total > MAX_TOTAL_HOURS
          ? 'text-[12px] font-bold text-warning'
          : 'text-[12px] font-semibold text-label'}>
          {slots.length} encontro(s) · {total}h / {MAX_TOTAL_HOURS}h
        </span>
      </div>
      {total > MAX_TOTAL_HOURS ? (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-warning">
          Reduza a duração: o limite é de 8 horas por reserva.
        </p>
      ) : null}
    </fieldset>
  );
}
