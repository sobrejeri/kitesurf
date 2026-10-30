'use client';

import Link from 'next/link';
import { useState } from 'react';

import { HOURLY_RATE_CENTS, MAX_HOURS, MIN_HOURS, QUOTE_PREVIEW_CENTS } from '@/data/demo';
import { formatMoney } from '@/lib/format';

import { Icon } from '../icon';
import { HoursStepper } from '../interactive';
import { Button, ButtonLink, Card, Field, Note, inputClass } from '../ui';

interface Meeting {
  id: number;
  date: string;
  start: string;
  hours: number;
}

/**
 * "Monte sua aula": the student picks a number of hours and spreads them over
 * one or more meetings with the same instructor. The estimate is the server's
 * quote preview for the total hours; the support vehicle is priced at review,
 * never summed here.
 */
export function LessonBuilder() {
  const [step, setStep] = useState<1 | 2>(1);
  const [hours, setHours] = useState(2);
  const [transport, setTransport] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([{ id: 1, date: '2026-10-31', start: '09:00', hours: 2 }]);
  const [open, setOpen] = useState(1);

  const distributed = meetings.reduce((sum, meeting) => sum + meeting.hours, 0);
  const estimate = QUOTE_PREVIEW_CENTS[hours];
  const balanced = distributed === hours;

  function update(id: number, patch: Partial<Meeting>) {
    setMeetings((current) => current.map((meeting) => (meeting.id === id ? { ...meeting, ...patch } : meeting)));
  }

  return (
    <>
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
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-[16px]">Total de horas</h2>
                  <p className="tabular mt-1 text-[12px] text-muted">{formatMoney(HOURLY_RATE_CENTS)}/hora</p>
                </div>
                <HoursStepper value={hours} onChange={setHours} min={MIN_HOURS} max={MAX_HOURS} />
              </div>
              <div className="mt-5 grid gap-3 border-t border-line pt-5">
                <Link href="/aluno/inicio" className="flex items-center justify-between rounded-search border border-line px-4 py-3.5">
                  <span>
                    <span className="block text-[11px] text-muted">Idioma, nível e praia</span>
                    <span className="text-[13px] font-[550]">Português · Primeira vez · Preá</span>
                  </span>
                  <Icon name="chevron" className="!h-4 !w-4 text-subtle" />
                </Link>
                <div className="rounded-search border border-line px-4 py-3.5">
                  <span className="block text-[11px] text-muted">Com quem quer fazer a aula?</span>
                  <span className="text-[13px] font-[550]">Buscar um instrutor pela fila</span>
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-search border border-line px-4 py-3.5">
                  <span>
                    <span className="block text-[13px] font-[550]">Transporte de apoio</span>
                    <span className="text-[11px] text-muted">Opcional · acompanha você durante a aula</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={transport}
                    onChange={(event) => setTransport(event.target.checked)}
                    className="h-5 w-5 accent-brand"
                  />
                </label>
              </div>
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
                          <input type="date" className={inputClass} value={meeting.date} onChange={(e) => update(meeting.id, { date: e.target.value })} />
                        </Field>
                        <Field label="Início">
                          <input type="time" className={inputClass} value={meeting.start} onChange={(e) => update(meeting.id, { start: e.target.value })} />
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
                onClick={() => {
                  const id = Math.max(...meetings.map((meeting) => meeting.id)) + 1;
                  setMeetings((current) => [...current, { id, date: '2026-11-01', start: '09:00', hours: 1 }]);
                  setOpen(id);
                }}
              >
                Adicionar encontro
              </Button>
              <p className={`mt-3 text-[12px] ${balanced ? 'text-muted' : 'text-warning'}`}>
                {distributed}h distribuídas em {meetings.length} encontro(s).
                {balanced ? '' : ` Ajuste para somar ${hours}h.`}
              </p>
            </Card>
          </div>
        ) : (
          <Card>
            <h2 className="text-[16px]">Revise antes de buscar</h2>
            <dl className="mt-4 grid gap-3 text-[13px]">
              <div className="flex justify-between border-b border-line pb-3"><dt className="text-muted">Aula</dt><dd className="font-[550]">Aula particular · {hours}h</dd></div>
              <div className="flex justify-between border-b border-line pb-3"><dt className="text-muted">Preferências</dt><dd className="font-[550]">Português · Primeira vez · Preá</dd></div>
              <div className="flex justify-between border-b border-line pb-3"><dt className="text-muted">Encontros</dt><dd className="font-[550]">{meetings.length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Transporte de apoio</dt><dd className="font-[550]">{transport ? 'Incluído na revisão' : 'Não'}</dd></div>
            </dl>
            <Note className="mt-5">
              Na demonstração, a busca encontra {`Rafael Lima`}, o primeiro instrutor compatível da fila. O pagamento de teste confirma a reserva.
            </Note>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="ghost" icon="back" onClick={() => setStep(1)}>Editar aula</Button>
              <ButtonLink href="/aluno/reserva" trailingIcon="arrow">Buscar instrutor</ButtonLink>
            </div>
          </Card>
        )}

        <Card className="self-start lg:sticky lg:top-24">
          <p className="text-[12px] text-muted">Total estimado</p>
          <p className="tabular mt-1 text-[32px] font-semibold tracking-[-0.7px] text-brand">
            {estimate === undefined ? '—' : formatMoney(estimate)}
          </p>
          <p className="tabular text-[11px] text-muted">
            {hours}h × {formatMoney(HOURLY_RATE_CENTS)}/hora{transport ? ' · transporte calculado na revisão' : ''}
          </p>
          {step === 1 ? (
            <Button className="mt-5 w-full" trailingIcon="arrow" disabled={!balanced} onClick={() => setStep(2)}>
              Continuar
            </Button>
          ) : null}
          <p className="mt-3 text-[11px] text-muted">Você revisa tudo antes de buscar o instrutor.</p>
        </Card>
      </div>
    </>
  );
}
