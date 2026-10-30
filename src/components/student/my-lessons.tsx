'use client';

import Link from 'next/link';
import { useState } from 'react';

import { BOOKING, INSTRUCTOR } from '@/data/demo';

import { Icon } from '../icon';
import { Segmented } from '../interactive';
import { Avatar, ButtonLink, Card, DateTile, EmptyState } from '../ui';

const TABS = ['Próximas aulas', 'Aulas anteriores'] as const;

export function MyLessons() {
  const [tab, setTab] = useState<string>(TABS[0]);
  return (
    <>
      <div className="max-w-md">
        <Segmented label="Aulas" options={TABS} value={tab} onChange={setTab} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {tab === TABS[0] ? (
          <article className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="relative h-36 bg-cover bg-center sm:h-44" style={{ backgroundImage: 'url(/images/kite-lesson.webp)' }}>
              <div className="absolute left-4 top-4">
                <DateTile day={BOOKING.day} month={BOOKING.month} />
              </div>
              <span className="absolute right-4 top-4 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-success">
                {BOOKING.status}
              </span>
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[17px]">{BOOKING.title}</h2>
                  <p className="mt-1 text-[12px] text-muted">Aula particular · {BOOKING.durationLabel}</p>
                </div>
                <Icon name="kite" className="text-faint" />
              </div>
              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-label">
                <span className="flex items-center gap-1.5"><Icon name="pin" className="!h-4 !w-4 text-brand" />{BOOKING.beach}</span>
                <span className="flex items-center gap-1.5"><Icon name="clock" className="!h-4 !w-4 text-brand" />{BOOKING.time}</span>
                <span className="flex items-center gap-1.5"><Icon name="calendar" className="!h-4 !w-4 text-brand" />{BOOKING.dateShort}</span>
              </p>
              <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
                <Avatar initials={INSTRUCTOR.initials} tone="a3" />
                <div className="flex-1">
                  <p className="text-[13px] font-[550]">{INSTRUCTOR.name}</p>
                  <p className="text-[11px] text-muted">Seu instrutor nessa jornada</p>
                </div>
                <Icon name="shield" className="text-brand" />
              </div>
              <div className="mt-4 flex gap-2">
                <ButtonLink href="/aluno/reserva" trailingIcon="arrow" className="flex-1">Ver reserva</ButtonLink>
                <ButtonLink href="/aluno/atendimento" variant="ghost" icon="chat">Chat</ButtonLink>
              </div>
              <Link href="/aluno/reservar" className="mt-4 flex items-center justify-center gap-2 text-[12px] font-[550] text-brand">
                <Icon name="refresh" className="!h-4 !w-4" /> Reservar novamente com {INSTRUCTOR.firstName}
              </Link>
            </div>
          </article>
        ) : (
          <EmptyState>Suas aulas realizadas aparecem aqui depois do registro do instrutor.</EmptyState>
        )}
        <Card tone="warm" className="self-start">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px]">Pronto para o mar?</h2>
              <p className="mt-1 text-[12px] text-muted">Alguns detalhes para curtir cada minuto da sua aula.</p>
            </div>
            <Icon name="sun" className="!h-7 !w-7 text-[#e8a23d]" />
          </div>
          <ul className="mt-4 grid gap-2.5 text-[12px] text-label">
            {['Chegue 15 minutos antes.', 'Leve água e protetor solar.', 'Respeite seu ritmo. Aproveite a jornada.'].map((tip) => (
              <li key={tip} className="flex gap-2"><Icon name="check" className="!h-4 !w-4 text-warning" />{tip}</li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] font-[550] text-warning">Menos pressa. Mais mar.</p>
        </Card>
      </div>
    </>
  );
}
