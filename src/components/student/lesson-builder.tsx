'use client';

import { useActionState, useState } from 'react';

import { createBooking } from '@/app/actions/booking';
import { LANGUAGES, MAX_HOURS } from '@/data/demo';
import { LEVEL_LABELS, type Beach, type LessonLevel, type QuoteRow } from '@/lib/data-labels';
import { formatMoney } from '@/lib/format';

import { Icon } from '../icon';
import { Button, Card, Field, Note, inputClass } from '../ui';

interface Meeting {
  id: number;
  date: string;
  start: string;
  hours: number;
}

export interface BuilderDefaults {
  beachId: string;
  level: LessonLevel;
  language: string;
  hours: number;
  date: string;
}

/**
 * "Monte sua aula": the student spreads hours over one or more meetings with
 * the same instructor. The estimate is looked up in the server's quote table;
 * the form submits choices only, and create_booking derives the price.
 */
export function LessonBuilder({
  quotes,
  beaches,
  defaults,
}: {
  quotes: readonly QuoteRow[];
  beaches: readonly Beach[];
  defaults: BuilderDefaults;
}) {
  const [state, formAction, pending] = useActionState(createBooking, {});
  const [step, setStep] = useState<1 | 2>(1);
  const [beachId, setBeachId] = useState(defaults.beachId);
  const beachName = beaches.find((beach) => beach.id === beachId)?.name ?? '—';
  const [level, setLevel] = useState<LessonLevel>(defaults.level);
  const [language, setLanguage] = useState(defaults.language);
  const [meetings, setMeetings] = useState<Meeting[]>([
    { id: 1, date: defaults.date, start: '09:00', hours: defaults.hours },
  ]);
  const [open, setOpen] = useState(1);
  const [editing, setEditing] = useState(false);

  const totalHours = meetings.reduce((sum, meeting) => sum + meeting.hours, 0);
  const quote = quotes.find((row) => row.hours === totalHours);
  const valid = totalHours >= 1 && totalHours <= MAX_HOURS && Boolean(beachId);

  function update(id: number, patch: Partial<Meeting>) {
    setMeetings((current) => current.map((meeting) => (meeting.id === id ? { ...meeting, ...patch } : meeting)));
  }

  const payload = JSON.stringify(meetings.map(({ date, start, hours }) => ({ date, start, hours })));

  return (
    <form action={formAction}>
      <input type="hidden" name="beachId" value={beachId} />
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="language" value={language} />
      <input type="hidden" name="meetings" value={payload} />

      <ol className="mb-6 flex gap-3 text-[12px]">
        {['1. Sua aula', '2. Revisar e buscar'].map((label, index) => (
          <li
            key={label}
            className={`flex-1 border-b-2 pb-2.5 ${step === index + 1 ? 'border-brand font-[550] text-brand' : 'border-line text-quiet'}`}
          >
            {label}
          </li>
        ))}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {step === 1 ? (
          <div className="grid gap-5">
            {/* Already chosen on Explorar: shown as a summary, editable on demand. */}
            <Card className="!p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-[#ff6a13]" aria-hidden="true">
                  <Icon name="pin" className="!h-5 !w-5" />
                </span>
                <p className="min-w-0 flex-1 text-[14px] leading-snug">
                  <strong className="block font-semibold text-ink">{beachName}</strong>
                  <span className="text-muted">{LEVEL_LABELS[level]} · {language}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setEditing(!editing)}
                  aria-expanded={editing}
                  className="press flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[13px] font-semibold text-brand"
                >
                  <Icon name="edit" className="!h-4 !w-4" />
                  {editing ? 'Pronto' : 'Editar'}
                </button>
              </div>
              {editing ? (
                <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
                  <Field label="Praia" icon="pin">
                    <select className={inputClass} value={beachId} onChange={(e) => setBeachId(e.target.value)}>
                      {beaches.map((beach) => (
                        <option key={beach.id} value={beach.id}>{beach.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Nível" icon="kite">
                    <select className={inputClass} value={level} onChange={(e) => setLevel(e.target.value as LessonLevel)}>
                      {Object.entries(LEVEL_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Idioma" icon="globe">
                    <select className={inputClass} value={language} onChange={(e) => setLanguage(e.target.value)}>
                      {LANGUAGES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              ) : null}
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-[16px]">Seus encontros</h2>
                <span className="text-[11px] text-muted">Mesmo instrutor</span>
              </div>
              <ul className="mt-4 grid gap-3">
                {meetings.map((meeting, index) => (
                  <li key={meeting.id} className="rounded-search border border-line">
                    <button
                      type="button"
                      onClick={() => setOpen(open === meeting.id ? 0 : meeting.id)}
                      aria-expanded={open === meeting.id}
                      className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                    >
                      <span>
                        <span className="block text-[13px] font-[550]">Encontro {index + 1}</span>
                        <span className="text-[11px] text-muted">
                          {meeting.date.split('-').reverse().slice(0, 2).join('/')} · {meeting.start} · {meeting.hours}h
                        </span>
                      </span>
                      <span className="text-[12px] font-[550] text-brand">{open === meeting.id ? 'Recolher' : 'Editar'}</span>
                    </button>
                    {open === meeting.id ? (
                      <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-3">
                        <Field label="Data">
                          <input type="date" required className={inputClass} value={meeting.date} onChange={(e) => update(meeting.id, { date: e.target.value })} />
                        </Field>
                        <Field label="Início">
                          <input type="time" required step={1800} className={inputClass} value={meeting.start} onChange={(e) => update(meeting.id, { start: e.target.value })} />
                        </Field>
                        <Field label="Horas">
                          <select className={inputClass} value={meeting.hours} onChange={(e) => update(meeting.id, { hours: Number(e.target.value) })}>
                            {Array.from({ length: MAX_HOURS }, (_, i) => i + 1).map((value) => (
                              <option key={value} value={value}>{value}h</option>
                            ))}
                          </select>
                        </Field>
                        {meetings.length > 1 ? (
                          <button
                            type="button"
                            className="text-left text-[12px] font-[550] text-danger sm:col-span-3"
                            onClick={() => setMeetings((current) => current.filter((item) => item.id !== meeting.id))}
                          >
                            Remover encontro
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Button
                variant="soft"
                icon="plus"
                className="mt-4"
                disabled={totalHours >= MAX_HOURS}
                onClick={() => {
                  const id = Math.max(...meetings.map((meeting) => meeting.id)) + 1;
                  const last = meetings[meetings.length - 1];
                  setMeetings((current) => [...current, { id, date: last?.date ?? defaults.date, start: '09:00', hours: 1 }]);
                  setOpen(id);
                }}
              >
                Adicionar encontro
              </Button>
              <p className={`mt-3 text-[12px] ${valid ? 'text-muted' : 'text-warning'}`}>
                {totalHours}h distribuídas em {meetings.length} encontro(s).
                {valid ? '' : ` O máximo por reserva é ${MAX_HOURS}h.`}
              </p>
            </Card>
          </div>
        ) : (
          <Card>
            <h2 className="text-[16px]">Revise antes de buscar</h2>
            <dl className="mt-4 grid gap-3 text-[13px]">
              <div className="flex justify-between border-b border-line pb-3"><dt className="text-muted">Aula</dt><dd className="font-[550]">Aula particular · {totalHours}h</dd></div>
              <div className="flex justify-between gap-3 border-b border-line pb-3"><dt className="text-muted">Preferências</dt><dd className="text-right font-[550]">{language} · {LEVEL_LABELS[level]} · {beachName}</dd></div>
              {meetings.map((meeting, index) => (
                <div key={meeting.id} className="flex justify-between border-b border-line pb-3 last:border-0">
                  <dt className="text-muted">Encontro {index + 1}</dt>
                  <dd className="font-[550]">{meeting.date.split('-').reverse().join('/')} · {meeting.start} · {meeting.hours}h</dd>
                </div>
              ))}
            </dl>
            <Note className="mt-5">
              Ao buscar, o Vento reserva o primeiro instrutor compatível da fila e calcula o total no servidor. O pagamento confirma a aula.
            </Note>
            {state.error ? <Note tone="warning" className="mt-3">{state.error}</Note> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="ghost" icon="back" onClick={() => setStep(1)}>Editar aula</Button>
              <Button type="submit" trailingIcon="arrow" disabled={pending || !valid}>
                {pending ? 'Buscando instrutor…' : 'Buscar instrutor'}
              </Button>
            </div>
          </Card>
        )}

        <Card className="self-start lg:sticky lg:top-24">
          <p className="text-[12px] text-muted">Total estimado</p>
          <p className="tabular mt-1 text-[32px] font-semibold tracking-[-0.7px] text-brand">
            {quote ? formatMoney(quote.total_cents) : '—'}
          </p>
          <p className="tabular text-[11px] text-muted">
            {quote ? `${totalHours}h × ${formatMoney(quote.hourly_rate_cents)}/hora` : 'Valor confirmado na reserva'}
          </p>
          {step === 1 ? (
            <Button className="mt-5 w-full" trailingIcon="arrow" disabled={!valid} onClick={() => setStep(2)}>
              Continuar
            </Button>
          ) : null}
          <p className="mt-3 text-[11px] text-muted">Você revisa tudo antes de buscar o instrutor.</p>
        </Card>
      </div>
    </form>
  );
}
