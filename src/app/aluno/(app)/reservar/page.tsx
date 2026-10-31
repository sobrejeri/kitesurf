import type { Metadata } from 'next';

import { LessonBuilder, type BuilderDefaults } from '@/components/student/lesson-builder';
import { StudentHero } from '@/components/student/sunset';
import { LANGUAGES } from '@/data/demo';
import { requireRole } from '@/lib/auth';
import { getQuoteTable, listActiveBeaches, type Beach } from '@/lib/data';
import { lessonDate } from '@/lib/dates';

export const metadata: Metadata = { title: 'Monte sua aula' };

type Params = { praia?: string; nivel?: string; idioma?: string; horas?: string; dia?: string };

/** Search parameters only preset the form; nothing here is trusted later. */
function defaultsFrom(params: Params, beaches: readonly Beach[]): BuilderDefaults {
  const hours = Number(params.horas);
  const today = lessonDate();
  const tomorrow = lessonDate(1);
  return {
    beachId: beaches.find((beach) => beach.id === params.praia)?.id ?? beaches[0]?.id ?? '',
    level: params.nivel === 'returning' || params.nivel === 'improving' ? params.nivel : 'first_time',
    language: LANGUAGES.find((language) => language === params.idioma) ?? 'Português',
    hours: Number.isInteger(hours) && hours >= 1 && hours <= 8 ? hours : 2,
    date: params.dia && /^\d{4}-\d{2}-\d{2}$/.test(params.dia) && params.dia >= today ? params.dia : tomorrow,
  };
}

export default async function BuildLessonPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole(['student'], '/aluno/reservar');
  const [params, quotes, beaches] = await Promise.all([searchParams, getQuoteTable(), listActiveBeaches()]);
  return (
    <div className="mar-profundo-page">
      <StudentHero eyebrow="Seu próximo bordo" title="Monte sua aula" highlight="aula" lead="Escolha suas horas e os dias para ir ao mar." compact image="ocean" />
      <div className="mt-4 md:mt-7" />
      <LessonBuilder quotes={quotes} beaches={beaches} defaults={defaultsFrom(params, beaches)} />
    </div>
  );
}
