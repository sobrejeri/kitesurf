'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Icon, type IconName } from '../icon';
import { Avatar, Badge, ButtonLink, DateTile } from '../ui';

import { IconBubble, KiteIllustration } from './sunset';

export interface LessonCard {
  bookingId: string;
  meetingId: string;
  startsAt: string;
  evolutionHref: string | null;
  title: string;
  statusLabel: string;
  statusTone: 'success' | 'warning' | 'quiet';
  day: string;
  month: string;
  beach: string;
  time: string;
  dateShort: string;
  durationLabel: string;
  instructorName: string;
  instructorInitials: string;
  past: boolean;
}

const TABS: readonly { label: string; icon: IconName }[] = [
  { label: 'Próximas aulas', icon: 'calendar' },
  { label: 'Aulas anteriores', icon: 'clock' },
];

const TIPS: readonly { title: string; body: string; icon: IconName }[] = [
  { title: 'Chegue 15 minutos antes.', body: 'Assim temos tempo para o preparo.', icon: 'clock' },
  { title: 'Leve água e protetor solar.', body: 'Hidratação e proteção sempre.', icon: 'drop' },
  { title: 'Respeite seu ritmo.', body: 'Aproveite a jornada, sem pressa.', icon: 'heart' },
];

export function MyLessons({ lessons, initialTab=0 }: { lessons: readonly LessonCard[]; initialTab?:0|1 }) {
  const [tab, setTab] = useState<number>(initialTab);
  const visible = lessons.filter((lesson) => (tab === 0 ? !lesson.past : lesson.past));
  return (
    <>
      <div role="tablist" aria-label="Aulas" className="mt-2 flex gap-1 rounded-full border border-line bg-surface p-1">
        {TABS.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={tab === index}
            onClick={() => setTab(index)}
            className={`press flex h-12 flex-1 items-center justify-center gap-2 rounded-full border text-[14px] ${tab === index ? 'border-brand/60 bg-brand-soft font-semibold text-ink' : 'border-transparent text-label'}`}
          >
            <Icon name={item.icon} className={`!h-5 !w-5 ${tab === index ? 'text-brand' : ''}`} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-4">
          {visible.length === 0 ? (
            <div className="grid place-items-center gap-2 rounded-[22px] border border-line bg-surface px-5 py-8 text-center">
              <KiteIllustration />
              <p className="text-[18px] font-semibold text-ink">
                {tab === 0 ? 'Nenhuma aula marcada ainda.' : 'Nenhuma aula realizada ainda.'}
              </p>
              <p className="max-w-[32ch] text-[14px] text-muted">
                {tab === 0
                  ? 'Que tal agendar sua primeira aula e viver essa experiência?'
                  : 'Suas aulas aparecem aqui depois do registro do instrutor.'}
              </p>
              {tab === 0 ? (
                <ButtonLink href="/aluno/reservar" trailingIcon="arrow" className="mt-3 px-8">
                  Reservar uma aula
                </ButtonLink>
              ) : null}
            </div>
          ) : (
            visible.map((lesson) => (
              <Link
                key={lesson.meetingId}
                href={lesson.evolutionHref ?? `/aluno/reserva/${lesson.bookingId}`}
                className="press block rounded-[22px] border border-line bg-surface p-4"
              >
                <div className="flex items-start gap-4">
                  <DateTile day={lesson.day} month={lesson.month} />
                  <div className="min-w-0 flex-1">
                    <Badge tone={lesson.statusTone}>{lesson.statusLabel}</Badge>
                    <p className="mt-1.5 text-[17px] font-semibold text-ink">{lesson.title}</p>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-label">
                      <span className="flex items-center gap-1.5"><Icon name="pin" className="!h-4 !w-4 text-brand" />{lesson.beach}</span>
                      <span className="flex items-center gap-1.5"><Icon name="clock" className="!h-4 !w-4 text-brand" />{lesson.time} · {lesson.durationLabel}</span>
                    </p>
                  </div>
                  <Icon name="chevron" className="mt-6 !h-5 !w-5 text-muted" />
                </div>
                <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
                  <Avatar initials={lesson.instructorInitials} size={34} />
                  <span className="text-[13px] leading-tight">
                    <strong className="block font-semibold text-ink">{lesson.instructorName}</strong>
                    <span className="text-[12px] text-muted">Seu instrutor nessa jornada</span>
                  </span>
                </div>
                {lesson.evolutionHref ? (
                  <span className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-brand">
                    <Icon name="chart" className="!h-4 !w-4" />
                    Abrir evolução desta aula
                  </span>
                ) : null}
              </Link>
            ))
          )}
        </div>

        <section className="relative self-start overflow-hidden rounded-[22px] border border-line bg-surface p-5">
          <img src="/images/prea-coast.webp" alt="" className="sunset-photo absolute inset-y-0 right-0 h-full w-[55%] object-cover" style={{ objectPosition: '80% 50%' }} />
          <span className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-surface)_45%,transparent_100%)]" aria-hidden="true" />
          <div className="relative max-w-[78%]">
            <h2 className="text-[26px] font-bold leading-tight text-ink">
              Pronto para o mar?
            </h2>
            <p className="mt-1 text-[14px] text-label">Alguns detalhes para curtir cada minuto da sua aula.</p>
            <ul className="mt-4 grid gap-3">
              {TIPS.map((tip) => (
                <li key={tip.title} className="flex items-center gap-3">
                  <IconBubble icon={tip.icon} size={42} />
                  <span className="text-[13px] leading-tight">
                    <strong className="block font-semibold text-ink">{tip.title}</strong>
                    <span className="text-[12px] text-muted">{tip.body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[16px] font-semibold text-brand">Menos pressa. Mais mar.</p>
          </div>
        </section>
      </div>
    </>
  );
}
