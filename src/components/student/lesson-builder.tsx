'use client';

import { Fragment, useActionState, useState } from 'react';

import { createBooking } from '@/app/actions/booking';
import { LANGUAGES } from '@/data/demo';
import { LEVEL_LABELS, type Beach, type LessonLevel, type QuoteRow } from '@/lib/data-labels';
import { lessonDate } from '@/lib/dates';
import { allowedLessonLevels, KITE_CURRICULA, KITE_LEVEL_BADGES } from '@/lib/kite-steps';
import { formatMoney } from '@/lib/format';
import { levelQuote } from '@/lib/level-prices';
import { hasScheduleConflict, type StudentTimeSlot } from '@/lib/student-schedule';
import { VALIDATION_WITHOUT_CHECKOUT } from '@/lib/booking-mode';

import { Icon, type IconName } from '../icon';
import { Button, Card, Field, Note, inputClass } from '../ui';
import { LessonDatePicker } from './lesson-date-picker';

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
  preferredInstructorId: string | null;
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
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-[#00e5f2]" aria-hidden="true">
          <Icon name={icon} className="!h-5 !w-5" />
        </span>
        {title}
      </h2>
      {aside}
    </div>
  );
}


/** Labeled data tile for the student booking review. */
function ReviewDetail({
  icon,
  label,
  value,
  wide = false,
  compact = false,
}: {
  icon: IconName;
  label: string;
  value: React.ReactNode;
  wide?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        'min-w-0 rounded-[16px] border border-[#176f8c] bg-[#052d48]/85',
        compact ? 'px-2.5 py-3' : 'px-3.5 py-3.5',
        wide ? 'col-span-2' : '',
      ].join(' ')}
    >
      <dt className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#125776]/75 px-2 py-1 text-[10px] font-bold text-[#abe6ed]">
        <Icon name={icon} className="!h-3.5 !w-3.5" />
        <span>{label}</span>
      </dt>
      <dd className="mt-2 break-words text-[14px] font-bold leading-snug text-white sm:text-[15px]">{value}</dd>
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
  studentLevel,
  occupiedSlots,
  startEditing = false,
}: {
  quotes: readonly QuoteRow[];
  beaches: readonly Beach[];
  defaults: BuilderDefaults;
  studentLevel: LessonLevel;
  occupiedSlots: readonly StudentTimeSlot[];
  /** Open the "Sua aula" fields on arrival (used when nothing was pre-chosen on Explorar). */
  startEditing?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createBooking, {});
  const [step, setStep] = useState<1 | 2>(1);
  const [beachId, setBeachId] = useState(defaults.beachId);
  const beachName = beaches.find((beach) => beach.id === beachId)?.name ?? '—';
  const [level, setLevel] = useState<LessonLevel>(defaults.level);
  const allowed = allowedLessonLevels(studentLevel);
  const [language, setLanguage] = useState(defaults.language);
  const [meetings, setMeetings] = useState<Meeting[]>([
    { id: 1, date: defaults.date, start: '09:00', hours: defaults.hours },
  ]);
  const [open, setOpen] = useState(1);
  const [editing, setEditing] = useState(startEditing);
  const [transport, setTransport] = useState(false);
  const [showCurriculum, setShowCurriculum] = useState(false);

  // The hour package chosen in Explorar is fixed. Meetings only distribute it
  // across dates; changing a meeting must not change the package or its quote.
  const selectedHours = defaults.hours;
  const totalHours = meetings.reduce((sum, meeting) => sum + meeting.hours, 0);
  const remainingHours = selectedHours - totalHours;
  const quote = levelQuote(quotes, level, selectedHours);
  const datesValid = meetings.every((meeting) => meeting.date >= lessonDate());
  const meetingsOverlap = meetings.some((a, index) => {
    const aStart = Date.parse(`${a.date}T${a.start}:00-03:00`);
    const aEnd = aStart + a.hours * 3600000;
    return meetings.some((b, j) => {
      if (j <= index) return false;
      const bStart = Date.parse(`${b.date}T${b.start}:00-03:00`);
      return aStart < bStart + b.hours * 3600000 && bStart < aEnd;
    });
  });
  const hoursFullyDistributed = remainingHours === 0;
  const proposedSlots = meetings.map((meeting) => ({
    startsAt: `${meeting.date}T${meeting.start}:00-03:00`, minutes: meeting.hours * 60,
  }));
  const existingConflict = proposedSlots.some((slot) => hasScheduleConflict([slot], occupiedSlots));
  const canAddMeeting = meetings.length < selectedHours &&
    (remainingHours > 0 || meetings.some((meeting) => meeting.hours > 1));
  const valid = hoursFullyDistributed && Boolean(beachId) && datesValid && !meetingsOverlap && !existingConflict && allowed.includes(level);

  function update(id: number, patch: Partial<Meeting>) {
    // The select options already cap each meeting, but validate state updates too.
    setMeetings((current) => {
      const otherHours = current.reduce((sum, meeting) => sum + (meeting.id === id ? 0 : meeting.hours), 0);
      return current.map((meeting) => {
        if (meeting.id !== id) return meeting;
        if (patch.hours === undefined) return { ...meeting, ...patch };
        const maxAllowed = selectedHours - otherHours;
        const hours = Math.max(1, Math.min(maxAllowed, Math.trunc(patch.hours)));
        return { ...meeting, ...patch, hours };
      });
    });
  }

  function addMeeting() {
    if (!canAddMeeting) return;

    let next = meetings;
    if (remainingHours === 0) {
      // All hours are in use: split one existing meeting instead of adding hours.
      const split = meetings.find((meeting) => meeting.hours > 1);
      if (!split) return;
      next = meetings.map((meeting) =>
        meeting.id === split.id ? { ...meeting, hours: meeting.hours - 1 } : meeting,
      );
    }

    const id = Math.max(...next.map((meeting) => meeting.id)) + 1;
    const last = next[next.length - 1];
    setMeetings([...next, { id, date: last?.date ?? defaults.date, start: '09:00', hours: 1 }]);
    setOpen(id);
  }

  const payload = JSON.stringify(meetings.map(({ date, start, hours }) => ({ date, start, hours })));

  return (
    <form action={formAction}>
      <input type="hidden" name="beachId" value={beachId} />
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="language" value={language} />
      <input type="hidden" name="meetings" value={payload} />
      <input type="hidden" name="expectedHours" value={selectedHours} />
      <input type="hidden" name="transport" value={transport ? 'yes' : 'no'} />
      <input type="hidden" name="preferredInstructorId" value={defaults.preferredInstructorId ?? ''} />

      {defaults.preferredInstructorId ? (
        <Note className="mb-4">
          Nova aula com o instrutor anterior: ele receberá prioridade para responder.
          Se recusar ou deixar a oferta expirar, a busca seguirá a fila de profissionais.
        </Note>
      ) : null}

      {/* Numbered stepper. */}
      <ol className="mb-6 flex items-center">
        {STEPS.map((label, index) => {
          const n = index + 1;
          const done = step > n;
          const active = step === n;
          return (
            <Fragment key={label}>
              <li className="flex items-center gap-2.5" aria-current={active ? 'step' : undefined}>
                <span
                  className={`lesson-step-number grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] font-extrabold ${
                    active || done ? 'lesson-step-number--active' : 'lesson-step-number--upcoming'
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
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand-soft text-[#00e5f2]" aria-hidden="true">
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
                      {Object.entries(LEVEL_LABELS).filter(([id]) =>
                        allowed.includes(id as LessonLevel)).map(([id, label]) => (
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

            <Card className="!p-4">
              <button
                type="button"
                onClick={() => setShowCurriculum(!showCurriculum)}
                aria-expanded={showCurriculum}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="min-w-0 flex-1 text-[14px] font-extrabold text-ink">
                  O que esta aula oferece · {KITE_LEVEL_BADGES[level].label}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-brand">
                  {showCurriculum ? 'Recolher' : 'Ver etapas'}
                  <Icon name="chevronDown" className={`!h-4 !w-4 transition-transform ${showCurriculum ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {showCurriculum ? (
                <>
                  <p className="mt-3 text-[12px] text-muted">
                    {KITE_LEVEL_BADGES[level].detail}. A sequência é uma referência,
                    não uma garantia de aprender todas as etapas em uma única aula.
                  </p>
                  <ul className="mt-3 grid gap-1.5">
                    {KITE_CURRICULA[level].map((item) => (
                      <li key={item.id} className="flex gap-2 text-[12px] text-label">
                        <span className="font-bold text-brand">{item.id}.</span>
                        {item.title}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-muted">
                    O instrutor define atividades compatíveis com suas habilidades
                    e com o vento e o mar no dia.
                  </p>
                </>
              ) : null}
            </Card>

            {/* Optional add-on: the instructor's own support vehicle. */}
            {quote && quote.transport_hourly_cents > 0 ? (
              <label className="press flex cursor-pointer items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card has-[:checked]:border-[#00dff0] has-[:checked]:bg-brand-tint">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-brand-soft text-[#00e5f2]" aria-hidden="true">
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
                  className="h-6 w-6 shrink-0 accent-[#00dff0]"
                />
              </label>
            ) : null}

            <Card>
              <SectionHead icon="calendar" title="Seus encontros" aside={<span className="text-[12px] text-muted">Mesmo instrutor</span>} />
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                Você escolheu <strong className="text-ink">{selectedHours}h de aula</strong>. Divida esse total entre
                um ou mais encontros, em dias diferentes se preferir.
              </p>
              <ul className="mt-4 grid gap-3">
                {meetings.map((meeting, index) => {
                  const { day, month } = dayParts(meeting.date);
                  const isOpen = open === meeting.id;
                  return (
                    <li key={meeting.id} className={`overflow-hidden rounded-[18px] border ${isOpen ? 'border-[#00dff0]' : 'border-line'}`}>
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? 0 : meeting.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left"
                      >
                        <span className="grid h-[52px] w-[48px] shrink-0 place-items-center content-center rounded-[12px] bg-brand-soft text-[#00e5f2]">
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
                            <LessonDatePicker
                              ariaLabel={`Data do encontro ${index + 1}`}
                              className={inputClass}
                              value={meeting.date}
                              onChange={(date) => update(meeting.id, { date })}
                            />
                          </Field>
                          <Field label="Início">
                            <input type="time" required step={1800} className={inputClass} value={meeting.start} onChange={(e) => update(meeting.id, { start: e.target.value })} />
                          </Field>
                          <Field label="Horas">
                            <select className={inputClass} value={meeting.hours} onChange={(e) => update(meeting.id, { hours: Number(e.target.value) })}>
                              {Array.from({ length: selectedHours - (totalHours - meeting.hours) }, (_, i) => i + 1).map((value) => (
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
                disabled={!canAddMeeting}
                onClick={addMeeting}
              >
                Adicionar encontro
              </Button>
              <div className="mt-4 space-y-2" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="font-semibold text-ink">
                    {totalHours}h de {selectedHours}h distribuídas
                  </span>
                  <span className={hoursFullyDistributed ? 'font-semibold text-brand' : 'font-semibold text-warning'}>
                    {hoursFullyDistributed ? 'Todas as horas definidas' : `Faltam ${remainingHours}h`}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Distribuição das horas"
                  aria-valuemin={0}
                  aria-valuemax={selectedHours}
                  aria-valuenow={totalHours}
                  className="h-2 overflow-hidden rounded-full bg-sand"
                >
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-200"
                    style={{ width: `${(totalHours / selectedHours) * 100}%` }}
                  />
                </div>
                <p className="text-[12px] text-muted">
                  {meetings.length} encontro(s). O total contratado permanece em {selectedHours}h.
                </p>
              </div>
              {!datesValid ? <p role="alert" className="mt-3 text-[12px] text-warning">Selecione hoje ou uma data futura para todos os encontros.</p> : null}
              {meetingsOverlap ? (
                <p role="alert" className="mt-3 text-[12px] text-warning">
                  Você colocou dois encontros no mesmo horário. Ajuste a data ou o início de uma das aulas para continuar.
                </p>
              ) : null}
              {existingConflict ? (
                <p role="alert" className="mt-3 text-[12px] text-warning">
                  Você já tem uma aula ou uma busca de instrutor nesse horário. Escolha outro dia ou horário sem sobreposição.
                </p>
              ) : null}
              {!hoursFullyDistributed ? (
                <p role="status" className="mt-3 text-[12px] text-warning">
                  Defina as {remainingHours}h restantes antes de continuar.
                </p>
              ) : null}
            </Card>
          </div>
        ) : (
          <Card className="!p-4 sm:!p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1b8097] bg-[#064461] px-3 py-1 text-[11px] font-bold text-[#83eaf0]">
                  <Icon name="check" className="!h-3.5 !w-3.5" />
                  Revisão da reserva
                </span>
                <h2 className="mt-3 text-[23px] font-extrabold leading-tight tracking-[-.7px] text-ink">
                  Confira sua aula
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  Veja os detalhes antes de procurar seu instrutor.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-line bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand">
                Etapa 2/2
              </span>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-2.5">
              <ReviewDetail icon="kite" label="Tipo de aula" value="Particular" />
              <ReviewDetail icon="clock" label="Horas contratadas" value={selectedHours === 1 ? '1 hora' : String(selectedHours) + ' horas'} />
              <ReviewDetail icon="pin" label="Praia" value={beachName} wide />
              <ReviewDetail icon="users" label="Nível no kite" value={LEVEL_LABELS[level]} />
              <ReviewDetail icon="globe" label="Idioma" value={language} />
              <ReviewDetail
                icon="car"
                label="Transporte de apoio"
                value={transport ? 'Incluído na reserva' : 'Não solicitado'}
                wide
              />
            </dl>

            <section className="mt-5 border-t border-line pt-5" aria-label="Datas dos encontros">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-[17px] font-extrabold text-ink">
                  <Icon name="calendar" className="!h-5 !w-5 text-brand" />
                  Seus encontros
                </h3>
                <span className="rounded-full border border-line bg-brand-tint px-2.5 py-1 text-[11px] font-bold text-brand">
                  {meetings.length} {meetings.length === 1 ? 'encontro' : 'encontros'}
                </span>
              </div>
              <div className="mt-3 grid gap-3">
                {meetings.map((meeting, index) => (
                  <div key={meeting.id} className="min-w-0 rounded-[18px] border border-[#147694] bg-[#002e49]/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-[.1em] text-[#80e9f0]">
                        Encontro {String(index + 1).padStart(2, '0')}
                      </span>
                      <Icon name="check" className="!h-[17px] !w-[17px] text-[#00e1ec]" />
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2">
                      <ReviewDetail
                        icon="calendar"
                        label="Data"
                        value={meeting.date.split('-').reverse().join('/')}
                        compact
                      />
                      <ReviewDetail icon="clock" label="Início" value={meeting.start} compact />
                      <ReviewDetail
                        icon="kite"
                        label="Duração"
                        value={String(meeting.hours) + 'h'}
                        compact
                      />
                    </dl>
                  </div>
                ))}
              </div>
            </section>

            <Note title="Como funciona a busca" className="mt-5">
              O Vento procura o primeiro instrutor disponível e compatível com sua aula.
              {VALIDATION_WITHOUT_CHECKOUT
                ? ' Nesta fase de validação, você confirma a aula após o aceite do instrutor, sem checkout e sem cobrança.'
                : ' O valor final é calculado pelo sistema e a reserva é confirmada após o pagamento.'}
            </Note>
            {state.error ? <Note tone="warning" className="mt-3">{state.error}</Note> : null}
          </Card>
        )}

        {/* Estimated price: amounts are formatted in BRL with two decimal places. */}
        <section className="self-start overflow-hidden rounded-[24px] border border-[#137394] bg-[#031f34] p-5 text-white shadow-search lg:sticky lg:top-24 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[1.5px] text-white/75">
              <Icon name="wallet" className="!h-4 !w-4 text-brand" /> Valor total estimado
            </p>
            <span className="rounded-full border border-[#176b86] bg-[#07415b] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#90eaf0]">
              Estimativa
            </span>
          </div>
          <p className="tabular mt-3 break-words text-[clamp(30px,9vw,40px)] font-extrabold leading-tight tracking-[-1px] text-brand">
            {quote ? formatMoney(transport ? quote.total_with_transport_cents : quote.total_cents) : '—'}
          </p>
          {quote ? (
            <dl className="tabular mt-4 grid gap-3 border-t border-white/15 pt-4 text-[13px] text-white/80">
              <div className="flex items-start justify-between gap-3">
                <dt className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[.08em] text-white/55">Aulas</span>
                  <span>{selectedHours}h × {formatMoney(quote.hourly_rate_cents)}/h</span>
                </dt>
                <dd className="shrink-0 whitespace-nowrap font-bold text-white">{formatMoney(quote.total_cents)}</dd>
              </div>
              {transport ? (
                <div className="flex items-start justify-between gap-3">
                  <dt className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-[.08em] text-white/55">Transporte de apoio</span>
                    <span>{selectedHours}h × {formatMoney(quote.transport_hourly_cents)}/h</span>
                  </dt>
                  <dd className="shrink-0 whitespace-nowrap font-bold text-white">{formatMoney(quote.transport_cents)}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-2 text-[12px] text-white/60">Valor confirmado na reserva</p>
          )}
          <div className="mt-5 border-t border-white/15 pt-5">
            {step === 1 ? (
              <Button
                className="w-full !min-h-14 !text-[16px]"
                trailingIcon="arrow"
                disabled={!valid}
                onClick={() => setStep(2)}
              >
                Continuar
              </Button>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Button
                  type="submit"
                  trailingIcon="arrow"
                  disabled={pending || !valid}
                  className="w-full !min-h-14 !px-3 !text-[15px] font-bold"
                >
                  {pending ? 'Procurando instrutor…' : 'Confirmar e buscar instrutor'}
                </Button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="press inline-flex min-h-10 items-center justify-center gap-1.5 px-2 text-[13px] font-semibold text-[#8beaf0] underline-offset-4 hover:underline focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-[#00e1ee] focus-visible:outline-offset-2"
                >
                  <Icon name="back" className="!h-4 !w-4" />
                  Voltar e editar aula
                </button>
              </div>
            )}
          </div>
          <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-white/65">
            <Icon name="shield" className="mt-0.5 !h-4 !w-4 shrink-0 text-brand" />
            Valores apresentados como estimativa; o total definitivo é calculado no servidor.
          </p>
        </section>
      </div>
    </form>
  );
}
