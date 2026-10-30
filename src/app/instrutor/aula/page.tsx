import type { Metadata } from 'next';

import { DemoForm } from '@/components/interactive';
import { Avatar, Badge, Button, ButtonLink, Card, Eyebrow, Field, KeyValue, Note, inputClass } from '@/components/ui';
import { BOOKING, INSTRUCTOR, LEARNING } from '@/data/demo';
import { formatMinutes } from '@/lib/format';

export const metadata: Metadata = { title: 'Realizar e registrar aula' };

export default function RunLessonPage() {
  return (
    <>
      <Eyebrow>Encontro com o aluno</Eyebrow>
      <h1 className="mt-2 text-[28px] tracking-[-0.9px] sm:text-[32px]">Sua aula com Luana</h1>
      <p className="mt-1 text-[13px] text-muted">{INSTRUCTOR.name} · {BOOKING.dateLong} · {BOOKING.time}</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[16px]">{BOOKING.title}</h2>
              <Badge>{BOOKING.status}</Badge>
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <KeyValue label="Local" value={BOOKING.meetingPoint} icon="pin" />
              <KeyValue label="Tempo agendado" value={BOOKING.durationLabel} icon="clock" />
              <KeyValue label="Momento do aluno" value={BOOKING.studentLevel} icon="kite" />
              <KeyValue label="Idioma" value="Português" icon="globe" />
            </dl>
          </Card>

          <Card tone="tinted">
            <h2 className="text-[16px]">Vamos começar?</h2>
            <p className="mt-1 text-[12px] text-muted">Peça o código de presença que aparece na reserva do aluno.</p>
            <DemoForm confirmation="Presença confirmada na demonstração. O registro de minutos fica disponível ao fim da aula." className="mt-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-40">
                  <Field label="Código de presença">
                    <input className={`${inputClass} tabular tracking-[4px]`} inputMode="numeric" maxLength={4} pattern="[0-9]{4}" required />
                  </Field>
                </div>
                <Button type="submit">Confirmar presença e iniciar</Button>
              </div>
            </DemoForm>
          </Card>

          <Card>
            <h2 className="text-[16px]">Gerenciar este encontro</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink href="/instrutor/ocorrencias" variant="ghost" size="sm">Vento, cancelamento ou ausência</ButtonLink>
              <ButtonLink href="/instrutor/atendimento" variant="ghost" size="sm">Chat com o aluno</ButtonLink>
              <ButtonLink href="/instrutor/politicas" variant="text" size="sm">Consultar regras</ButtonLink>
            </div>
            <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <div>
                <p className="text-[12px] font-[550] text-brand">Ponto de encontro</p>
                <p className="mt-1 text-[12px] text-muted">Referência a confirmar pela operação.</p>
              </div>
              <div>
                <p className="text-[12px] font-[550] text-brand">Reagendar</p>
                <p className="mt-1 text-[12px] text-muted">{BOOKING.rescheduleDeadline}</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="self-start">
          <div className="flex items-center gap-3">
            <Avatar initials="L" tone="a3" size={44} />
            <div>
              <p className="font-[550]">Luana</p>
              <p className="text-[11px] text-muted">Aluno · {BOOKING.studentLevel}</p>
            </div>
          </div>
          <h2 className="mt-5 text-[14px]">Histórico do aprendizado</h2>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span>{formatMinutes(LEARNING.doneMinutes)} realizadas</span>
            <span>{formatMinutes(LEARNING.scheduledMinutes)} agendadas</span>
            <span>{formatMinutes(LEARNING.availableMinutes)} disponíveis</span>
          </p>
          {LEARNING.history.map((entry) => (
            <div key={entry.date} className="mt-3 rounded-search border border-line p-4">
              <p className="text-[12px] font-[550] text-brand">{formatMinutes(entry.minutes)} · {entry.date}</p>
              <p className="mt-1 text-[12px] text-label">{entry.note}</p>
            </div>
          ))}
          <Note className="mt-4">
            Uma aula parcial devolve ao saldo o tempo que não foi realizado. O registro fica visível para o aluno.
          </Note>
        </Card>
      </div>
    </>
  );
}
