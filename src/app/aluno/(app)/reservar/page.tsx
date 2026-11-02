import type { Metadata } from 'next';

import { LessonBuilder, type BuilderDefaults } from '@/components/student/lesson-builder';
import { StudentHero } from '@/components/student/sunset';
import { LANGUAGES } from '@/data/demo';
import { requireRole } from '@/lib/auth';
import { getQuoteTable, listActiveBeaches, type Beach } from '@/lib/data';
import { lessonDate } from '@/lib/dates';
import { getStudentKiteLevel } from '@/lib/student-kite-level';
import { allowedLessonLevels } from '@/lib/kite-steps';
import type { LessonLevel } from '@/lib/data-labels';

export const metadata: Metadata = { title: 'Monte sua aula' };

type Params = { praia?: string; nivel?: string; idioma?: string; horas?: string; dia?: string; instrutor?: string };

/** Search parameters only preset the form; nothing here is trusted later. */
function defaultsFrom(params: Params, beaches: readonly Beach[], profileLevel: LessonLevel): BuilderDefaults {
  const hours = Number(params.horas);
  const today = lessonDate();
  const tomorrow = lessonDate(1);
  const requestedLevel: LessonLevel = params.nivel === 'returning' || params.nivel === 'improving' ? params.nivel : 'first_time';
  return {
    beachId: beaches.find((beach) => beach.id === params.praia)?.id ?? beaches[0]?.id ?? '',
    level: allowedLessonLevels(profileLevel).includes(requestedLevel) ? requestedLevel : profileLevel,
    language: LANGUAGES.find((language) => language === params.idioma) ?? 'Português',
    hours: Number.isInteger(hours) && hours >= 1 && hours <= 8 ? hours : 2,
    date: params.dia && /^\d{4}-\d{2}-\d{2}$/.test(params.dia) && params.dia >= today ? params.dia : tomorrow,
    preferredInstructorId: params.instrutor && /^[a-f0-9-]{36}$/i.test(params.instrutor) ? params.instrutor : null,
  };
}

export default async function BuildLessonPage({ searchParams }: { searchParams: Promise<Params> }) {
  const viewer = await requireRole(['student'], '/aluno/reservar');
  const [params, quotes, beaches, kiteLevel] = await Promise.all([
    searchParams, getQuoteTable(), listActiveBeaches(), getStudentKiteLevel(viewer.id),
  ]);
  return (
    <div className="mar-profundo-page">
      <StudentHero eyebrow="Seu próximo bordo" title="Monte sua aula" highlight="aula" lead="Escolha suas horas e os dias para ir ao mar." compact image="ocean" />
      <div className="mt-4 md:mt-7" />
      <LessonBuilder quotes={quotes} beaches={beaches} defaults={defaultsFrom(params, beaches, kiteLevel.effective)}
        studentLevel={kiteLevel.effective} />
    </div>
  );
}
