import type { Metadata } from 'next';

import { Icon } from '@/components/icon';
import { ButtonLink, Card, StatCard } from '@/components/ui';
import { INSTRUCTOR, LEARNING } from '@/data/demo';
import { formatMinutes } from '@/lib/format';

export const metadata: Metadata = { title: 'Minha evolução' };

export default function ProgressPage() {
  const ring = 2 * Math.PI * 34;
  return (
    <>
      <h1 className="mb-5 text-[28px] tracking-[-0.9px] sm:text-[32px]">Minha evolução</h1>

      <Card tone="brand" className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[19px] text-white">Seu tempo no mar</h2>
          <p className="mt-1 text-[12px] text-on-brand-muted">
            {formatMinutes(LEARNING.doneMinutes)} de {formatMinutes(LEARNING.contractedMinutes)} realizados
          </p>
        </div>
        <div className="relative grid h-[84px] w-[84px] place-items-center">
          <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#ffffff30" strokeWidth="5" />
            <circle
              cx="40" cy="40" r="34" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={ring} strokeDashoffset={ring * (1 - LEARNING.donePercent / 100)}
            />
          </svg>
          <p className="text-center leading-none">
            <span className="block text-[20px] font-semibold">{LEARNING.donePercent}%</span>
            <span className="text-[7px] text-on-brand-muted">das horas<br />realizadas</span>
          </p>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Horas contratadas" value={formatMinutes(LEARNING.contractedMinutes)} hint="Aula particular de kitesurf" icon="book" />
        <StatCard label="Horas realizadas" value={formatMinutes(LEARNING.doneMinutes)} hint={`${LEARNING.history.length} registro(s) de aula`} icon="check" />
        <StatCard label="Horas agendadas" value={formatMinutes(LEARNING.scheduledMinutes)} hint={`Com ${INSTRUCTOR.firstName}`} icon="calendar" />
        <StatCard label="Saldo disponível" value={formatMinutes(LEARNING.availableMinutes)} hint="Para os próximos encontros" icon="wind" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[18px]">Seu caminho no kite</h2>
              <p className="mt-1 text-[12px] text-muted">Acompanhado pelo seu instrutor.</p>
            </div>
            <Icon name="flag" />
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-search bg-brand-tint px-4 py-3.5">
            <Icon name="kite" className="!h-6 !w-6 text-brand" />
            <div>
              <p className="text-[12px] font-[550] text-brand">{LEARNING.stepsDone} de {LEARNING.steps.length} etapas trabalhadas</p>
              <p className="text-[11px] text-muted">Aprendizado no seu ritmo, um passo de cada vez.</p>
            </div>
          </div>
          <ol className="mt-5 grid gap-0">
            {LEARNING.steps.map((step, index) => (
              <li key={step.title} className="relative flex gap-4 pb-5 last:pb-0">
                {index < LEARNING.steps.length - 1 ? (
                  <span className="absolute left-[15px] top-8 h-[calc(100%-28px)] border-l border-dashed border-line-ghost" aria-hidden="true" />
                ) : null}
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${step.done ? 'bg-brand-soft text-brand' : 'bg-sand text-faint'}`}>
                  <Icon name={step.done ? 'check' : 'kite'} className="!h-4 !w-4" />
                </span>
                <div>
                  <p className="text-[13px] font-[550]">{step.title}</p>
                  <p className="text-[11px] text-muted">{step.done ? 'Trabalhado em aula' : 'Próxima etapa de aprendizado'}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <h2 className="text-[16px]">Extrato de horas</h2>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span>{formatMinutes(LEARNING.doneMinutes)} realizadas</span>
              <span>{formatMinutes(LEARNING.scheduledMinutes)} agendadas</span>
              <span>{formatMinutes(LEARNING.availableMinutes)} disponíveis</span>
            </p>
            <ul className="mt-4 grid gap-3">
              {LEARNING.history.map((entry) => (
                <li key={entry.date} className="rounded-search border border-line p-4">
                  <p className="text-[13px] font-[550] text-brand">{formatMinutes(entry.minutes)} de aula realizada</p>
                  <p className="text-[11px] text-muted">{entry.date} · {entry.instructor}</p>
                  <p className="mt-2 text-[12px] text-label">{entry.note}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card tone="tinted">
            <h2 className="text-[16px]">O próximo bordo te espera.</h2>
            <p className="mt-1 text-[12px] text-muted">
              Continue sua jornada com {INSTRUCTOR.name}. O saldo de horas fica com o instrutor contratado.
            </p>
            <ButtonLink href="/aluno/reserva" className="mt-4" trailingIcon="arrow">Ver minha aula agendada</ButtonLink>
          </Card>
        </div>
      </div>
    </>
  );
}
