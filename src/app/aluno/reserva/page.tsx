import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { Avatar, Badge, ButtonLink, Card, Eyebrow, KeyValue, Note, ProgressBar } from '@/components/ui';
import { BOOKING, INSTRUCTOR, LEARNING } from '@/data/demo';
import { formatMinutes, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Sua reserva' };

const STEPS = ['Sua aula', 'Instrutor', 'Confirmação'] as const;

export default function BookingPage() {
  const reservedPercent = Math.round((LEARNING.scheduledMinutes / LEARNING.contractedMinutes) * 100);
  return (
    <>
      <Eyebrow>Seu próximo bordo</Eyebrow>
      <h1 className="mt-2 text-[28px] tracking-[-0.9px] sm:text-[32px]">Sua aula está confirmada.</h1>
      <p className="mt-1 text-[13px] text-muted">Tudo organizado. Confira os detalhes e encontre seu instrutor.</p>

      <ol className="my-6 flex items-center gap-3 text-[12px]">
        {STEPS.map((step, index) => (
          <li key={step} className="flex flex-1 items-center gap-2 last:flex-none">
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${index === 2 ? 'bg-brand text-white' : 'bg-brand-soft text-brand'}`}>
              {index === 2 ? 3 : <Icon name="check" className="!h-3.5 !w-3.5" />}
            </span>
            <span className={index === 2 ? 'font-[550] text-brand' : 'text-label'}>{step}</span>
            {index < 2 ? <span className="h-px flex-1 bg-line" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>

      <ButtonLink href="/aluno/atendimento" icon="chat" className="w-full !rounded-[13px]">Conversar com o instrutor</ButtonLink>

      <Link href="/aluno/politicas" className="mt-3 flex items-center justify-between rounded-card border border-line bg-surface px-5 py-5 text-[13px] font-[550] shadow-card">
        Aula prestada por {INSTRUCTOR.name}
        <Icon name="chevron" className="!h-4 !w-4 text-subtle" />
      </Link>

      <Card className="mt-3">
        <h2 className="text-[16px]">Gerenciar este encontro</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href="/aluno/ocorrencias" variant="ghost" size="sm">Vento, cancelamento ou ausência</ButtonLink>
          <ButtonLink href="/aluno/atendimento" variant="ghost" size="sm">Chat com o instrutor</ButtonLink>
          <ButtonLink href="/aluno/politicas" variant="text" size="sm">Consultar regras</ButtonLink>
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-[12px] font-[550] text-brand">Ponto de encontro</p>
          <p className="mt-1 text-[12px] text-muted">Referência a confirmar pela operação.</p>
        </div>
      </Card>

      <Link href="/aluno/reservar" className="my-5 inline-flex items-center gap-2 text-[12px] font-[550] text-brand">
        <Icon name="refresh" className="!h-4 !w-4" /> Reservar novamente com {INSTRUCTOR.firstName}
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[16px]">{BOOKING.title}</h2>
              <Badge>{BOOKING.status}</Badge>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Avatar initials={INSTRUCTOR.initials} tone="a3" size={44} />
              <div className="flex-1">
                <p className="font-[550]">{INSTRUCTOR.name}</p>
                <p className="text-[11px] text-muted">Seu instrutor · Português</p>
              </div>
              <Link href="/aluno/reserva" className="flex items-center gap-1 text-[13px] font-[550] text-brand">
                Ver perfil <Icon name="arrow" className="!h-4 !w-4" />
              </Link>
            </div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <KeyValue label="Data" value={BOOKING.dateLong} icon="calendar" />
              <KeyValue label="Horário" value={`${BOOKING.time} · ${BOOKING.durationLabel}`} icon="clock" />
              <KeyValue label="Ponto de encontro" value={BOOKING.meetingPoint} icon="pin" />
              <KeyValue label="Equipamentos" value="Incluídos na sua aula" icon="kite" />
            </dl>
            <div className="mt-5 flex items-center gap-2.5 rounded-note border border-[#d6eadf] bg-success-soft px-4 py-3 text-[12px] text-success">
              <Icon name="pin" className="!h-4 !w-4" />
              Confira o ponto de encontro definido pela operação em Gerenciar este encontro.
            </div>
            <ButtonLink href="/aluno/ocorrencias" variant="soft" icon="calendar" className="mt-5 !rounded-[13px]">Reagendar</ButtonLink>
            <p className="mt-2 text-[11px] text-muted">{BOOKING.rescheduleDeadline}</p>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-[16px]">Seu saldo de aprendizado</h2>
              <span className="tabular font-[550]">{formatMinutes(LEARNING.contractedMinutes)}</span>
            </div>
            <div className="mt-4">
              <ProgressBar donePercent={LEARNING.donePercent} reservedPercent={reservedPercent} />
            </div>
            <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
              <span>● {formatMinutes(LEARNING.doneMinutes)} realizadas</span>
              <span>● {formatMinutes(LEARNING.scheduledMinutes)} agendadas</span>
              <span>○ {formatMinutes(LEARNING.availableMinutes)} disponíveis</span>
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-[13px]">
              <span className="text-muted">Horas disponíveis para agendar</span>
              <strong className="tabular font-[550]">{formatMinutes(LEARNING.availableMinutes)}</strong>
            </div>
            <Link href="/aluno/evolucao" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-[550] text-brand">
              <Icon name="arrow" className="!h-4 !w-4" /> Acompanhar minha evolução
            </Link>
          </Card>
        </div>

        <div className="grid content-start gap-5">
          <Card className="text-center">
            <Eyebrow>Na hora da aula</Eyebrow>
            <h2 className="mt-2 text-[16px]">Seu código de presença</h2>
            <p className="mt-1 text-[12px] text-muted">Mostre ao instrutor para iniciar o atendimento.</p>
            <p className="tabular mt-4 rounded-search border border-line bg-brand-tint py-5 text-[36px] font-semibold tracking-[4px] text-brand">
              {BOOKING.presenceCode}
            </p>
            <p className="mt-3 text-[11px] text-muted">Reserva {BOOKING.code}</p>
          </Card>
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-label">Pagamento</span>
              <Badge><Icon name="check" className="!h-3 !w-3" />Confirmado</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[13px] text-label">Total da reserva</span>
              <strong className="tabular text-[24px] font-semibold tracking-[-0.7px] text-brand">{formatMoney(BOOKING.totalCents)}</strong>
            </div>
            <p className="mt-3 text-[11px] text-muted">Comprovante demonstrativo disponível na reserva.</p>
          </Card>
          <Note>O total vem da reserva confirmada. Valores e pagamento são demonstrativos.</Note>
        </div>
      </div>
    </>
  );
}
