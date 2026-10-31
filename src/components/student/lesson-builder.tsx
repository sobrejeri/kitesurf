'use client';

import { Fragment, useActionState, useState } from 'react';

import { createBooking } from '@/app/actions/booking';
import { LANGUAGES, MAX_HOURS } from '@/data/demo';
import { LEVEL_LABELS, type Beach, type LessonLevel, type QuoteRow } from '@/lib/data-labels';
import { formatMoney } from '@/lib/format';

import { Icon, type IconName } from '../icon';
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

const STEPS = ['Sua aula', 'Revisar e buscar'] as const;
const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** "2026-10-31" → { day: "31", month: "OUT" }, read straight from the parts so
 *  no timezone shift moves it to the day before. */
function dayParts(date: string): { day: string; month: string } {
  const [, month, day] = date.split('-');
  return { day: day ?? '--', month: MONTHS[Number(month) - 1] ?? '' };
}

/** A section heading with an orange icon bubble, in the display face. */
function SectionHead({ icon, title, aside }: { icon: IconName; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-[19px] font-extrabold text-ink">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-[#ff6a13]" aria-hidden="true">
          <Icon name={icon} className="!h-5 !w-5" />
        </span>
        {title}
      </h2>
      {aside}
    </div>
  );
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
  const [transport, setTransport] = useState(false);

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
      <input type="hidden" name="transport" value={transport ? 'yes' : 'no'} />

      {/* Numbered stepper. */}
      <ol className="mb-6 flex items-center">
        {STEPS.map((label, index) => {
          const n = index + 1;
          const done = step > n;
          const active = step === n;
          return (
            <Fragment key={label}>
              <li className="flex items-center gap-2.5">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] font-bold ${
                    active || done ? 'btn-primary text-white shadow-button' : 'bg-sand text-muted'
                  }`}
                >
                  {done ? <Icon name="check" className="!h-5 !w-5" /> : n}
                </span>
                <span className={`text-[14px] font-bold ${active ? 'text-ink' : 'text-muted'}`}>{label}</span>
              </li>
              {index < STEPS.length - 1 ? <span className="mx-3 h-0.5 flex-1 rounded-full bg-line" /> : null}
            </Fragment>
          );
        })}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {step === 1 ? (
          <div className="grid gap-5">
            {/* Already chosen on Explorar: shown as a summary, editable on demand. */}
            <Card className="!p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand-soft text-[#ff6a13]" aria-hidden="true">
                  <Icon name="pin" className="!h-6 !w-6" />
                </span>
                <p className="min-w-0 flex-1 leading-snug">
                  <strong className="block text-[16px] font-extrabold text-ink">{beachName}</strong>
                  <span className="text-[13px] text-muted">{LEVEL_LABELS[level]} · {language}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setEditing(!editing)}
                  aria-expanded={editing}
                  className="press flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-[13px] font-bold text-brand"
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

            {/* Optional add-on: the instructor's own support vehicle. */}
            {quote && quote.transport_hourly_cents > 0 ? (
              <label className="press flex cursor-pointer items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card has-[:checked]:border-[#ff6a13] has-[:checked]:bg-brand-tint">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand-soft text-[#ff6a13]" aria-hidden="true">
                  <Icon name="car" className="!h-6 !w-6" />
                </span>
                <span className="min-w-0 flex-1 leading-snug">
                  <strong className="block text-[15px] font-extrabold text-ink">Transporte de apoio</strong>
                  <span className="tabular text-[12px] text-muted">
                    Veículo do instrutor acompanha a aula · + {formatMoney(quote.transport_hourly_cents)}/hora
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={transport}
                  onChange={(event) => setTransport(event.target.checked)}
                  className="h-6 w-6 shrink-0 accent-[#ff6a13]"
                />
              </label>
            ) : null}

            <Card>
              <SectionHead icon="calendar" title="Seus encontros" aside={<span className="text-[12px] text-muted">Mesmo instrutor</span>} />
              <ul className="mt-4 grid gap-3">
                {meetings.map((meeting, index) => {
                  const { day, month } = dayParts(meeting.date);
                  const isOpen = open === meeting.id;
                  return (
                    <li key={meeting.id} className={`overflow-hidden rounded-[18px] border ${isOpen ? 'border-[#ff6a13]' : 'border-line'}`}>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? 0 : meeting.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left"
                      >
                        <span className="grid h-[52px] w-[48px] shrink-0 place-items-center content-center rounded-[12px] bg-brand-soft text-[#ff6a13]">
                          <span className="text-[22px] font-extrabold leading-none">{day}</span>
                          <span className="mt-0.5 text-[9px] font-bold tracking-[1px]">{month}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold text-ink">Encontro {index + 1}</span>
                          <span className="tabular text-[12px] text-muted">{meeting.start} · {meeting.hours}h de aula</span>
                        </span>
                        <span className="flex items-center gap-1 text-[13px] font-bold text-brand">
                          {isOpen ? 'Recolher' : 'Editar'}
                          <Icon name="chevronDown" className={`!h-4 !w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </span>
                      </button>
                      {isOpen ? (
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
                              className="flex items-center gap-1.5 text-left text-[13px] font-bold text-danger sm:col-span-3"
                              onClick={() => setMeetings((current) => current.filter((item) => item.id !== meeting.id))}
                            >
                              <Icon name="minus" className="!h-4 !w-4" /> Remover encontro
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
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
            <SectionHead icon="check" title="Revise antes de buscar" />
            <dl className="mt-4 grid gap-3 text-[14px]">
              <div className="flex justify-between border-b border-line pb-3"><dt className="text-muted">Aula</dt><dd className="font-bold text-ink">Aula particular · {totalHours}h</dd></div>
              <div className="flex justify-between gap-3 border-b border-line pb-3"><dt className="text-muted">Preferências</dt><dd className="text-right font-bold text-ink">{language} · {LEVEL_LABELS[level]} · {beachName}</dd></div>
              <div className="flex justify-between gap-3 border-b border-line pb-3"><dt className="text-muted">Transporte de apoio</dt><dd className="font-bold text-ink">{transport ? 'Sim' : 'Não'}</dd></div>
              {meetings.map((meeting, index) => (
                <div key={meeting.id} className="flex justify-between border-b border-line pb-3 last:border-0">
                  <dt className="text-muted">Encontro {index + 1}</dt>
                  <dd className="tabular font-bold text-ink">{meeting.date.split('-').reverse().join('/')} · {meeting.start} · {meeting.hours}h</dd>
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

        {/* Total on a deep-navy card so it stands out against the sand. */}
        <section className="self-start overflow-hidden rounded-[24px] bg-[#0f1b2d] p-6 text-white shadow-search lg:sticky lg:top-24">
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[2px] text-white/70">
            <Icon name="wallet" className="!h-4 !w-4 text-sunrise" /> Total estimado
          </p>
          <p className="tabular mt-2 text-[40px] font-extrabold leading-none tracking-[-1px] text-sunrise">
            {quote ? formatMoney(transport ? quote.total_with_transport_cents : quote.total_cents) : '—'}
          </p>
          {quote ? (
            <dl className="tabular mt-4 grid gap-2 border-t border-white/15 pt-4 text-[12px] text-white/75">
              <div className="flex justify-between">
                <dt>Aula · {totalHours}h × {formatMoney(quote.hourly_rate_cents)}</dt>
                <dd className="font-semibold text-white">{formatMoney(quote.total_cents)}</dd>
              </div>
              {transport ? (
                <div className="flex justify-between">
                  <dt>Transporte · {totalHours}h × {formatMoney(quote.transport_hourly_cents)}</dt>
                  <dd className="font-semibold text-white">{formatMoney(quote.transport_cents)}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-2 text-[12px] text-white/60">Valor confirmado na reserva</p>
          )}
          {step === 1 ? (
            <Button className="mt-5 w-full !min-h-14 !text-[16px]" trailingIcon="arrow" disabled={!valid} onClick={() => setStep(2)}>
              Continuar
            </Button>
          ) : null}
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/60">
            <Icon name="shield" className="!h-4 !w-4" /> Você revisa tudo antes de buscar o instrutor.
          </p>
        </section>
      </div>
    </form>
  );
}
