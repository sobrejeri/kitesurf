import type { Metadata } from 'next';

import { LessonBuilder, type BuilderDefaults } from '@/components/student/lesson-builder';
import { StudentHero } from '@/components/student/sunset';
import { LANGUAGES } from '@/data/demo';
import { requireRole } from '@/lib/auth';
import { getQuoteTable } from '@/lib/data';
import { lessonDate } from '@/lib/dates';

export const metadata: Metadata = { title: 'Monte sua aula' };

type Params = { praia?: string; nivel?: string; idioma?: string; horas?: string; dia?: string };

/** Search parameters only preset the form; nothing here is trusted later. */
function defaultsFrom(params: Params): BuilderDefaults {
  const hours = Number(params.horas);
  const tomorrow = lessonDate(1);
  return {
    beach: params.praia === 'jeri' ? 'jeri' : 'prea',
    level: params.nivel === 'returning' || params.nivel === 'improving' ? params.nivel : 'first_time',
    language: LANGUAGES.find((language) => language === params.idioma) ?? 'Português',
    hours: Number.isInteger(hours) && hours >= 1 && hours <= 8 ? hours : 2,
    date: params.dia && /^\d{4}-\d{2}-\d{2}$/.test(params.dia) && params.dia >= tomorrow ? params.dia : tomorrow,
  };
}

export default async function BuildLessonPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole(['student'], '/aluno/reservar');
  const [params, quotes] = await Promise.all([searchParams, getQuoteTable()]);
  return (
    <>
      <StudentHero eyebrow="Seu próximo bordo" title="Monte sua aula" highlight="aula" lead="Escolha suas horas e os dias para ir ao mar." compact image="lesson" />
      <div className="mt-6" />
      <LessonBuilder quotes={quotes} defaults={defaultsFrom(params)} />
    </>
  );
}
