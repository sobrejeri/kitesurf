import type { Metadata } from 'next';

import { LessonBuilder, type BuilderDefaults } from '@/components/student/lesson-builder';
import { StudentHero } from '@/components/student/sunset';
import { DesktopPageHeader } from '@/components/student/desktop-page-header';
import { LANGUAGES } from '@/data/demo';
import { requireRole } from '@/lib/auth';
import { getQuoteTable, listActiveBeaches, type Beach } from '@/lib/data';
import { lessonDate } from '@/lib/dates';
import { getStudentKiteLevel } from '@/lib/student-kite-level';
import { allowedLessonLevels } from '@/lib/kite-steps';
import type { LessonLevel } from '@/lib/data-labels';
import { getStudentOccupiedSlots } from '@/lib/student-occupied-slots';

export const metadata: Metadata = { title: 'Monte sua aula' };

type Params = { praia?: string; nivel?: string; idioma?: string; horas?: string; dia?: string; instrutor?: string };

function requestedHours(value?: string): number | undefined {
  const hours = Number(value);
  return Number.isInteger(hours) && hours >= 1 && hours <= 8 ? hours : undefined;
}

/** Search parameters only preset the form; nothing here is trusted later. */
function defaultsFrom(params: Params, beaches: readonly Beach[], profileLevel: LessonLevel): BuilderDefaults {
  const today = lessonDate();
  const tomorrow = lessonDate(1);
  const requestedLevel: LessonLevel = params.nivel === 'returning' || params.nivel === 'improving' ? params.nivel : 'first_time';
  return {
    beachId: beaches.find((beach) => beach.id === params.praia)?.id ?? beaches[0]?.id ?? '',
    level: allowedLessonLevels(profileLevel).includes(requestedLevel) ? requestedLevel : profileLevel,
    language: LANGUAGES.find((language) => language === params.idioma) ?? 'Português',
    hours: requestedHours(params.horas) ?? 2,
    date: params.dia && /^\d{4}-\d{2}-\d{2}$/.test(params.dia) && params.dia >= today ? params.dia : tomorrow,
    preferredInstructorId: params.instrutor && /^[a-f0-9-]{36}$/i.test(params.instrutor) ? params.instrutor : null,
  };
}

export default async function BuildLessonPage({ searchParams }: { searchParams: Promise<Params> }) {
  const viewer = await requireRole(['student'], '/aluno/reservar');
  const [params, quotes, beaches, kiteLevel, occupiedSlots] = await Promise.all([
    searchParams, getQuoteTable(), listActiveBeaches(), getStudentKiteLevel(viewer.id), getStudentOccupiedSlots(viewer.id),
  ]);
  return (
    <div className="mar-profundo-page mar-profundo-page--booking vento-pc-secondary-page vento-pc-booking-screen">
      <DesktopPageHeader eyebrow="SEU PRÓXIMO BORDO" title="Monte sua aula" lead="Escolha seu nível, os horários e organize cada encontro com clareza." icon="calendar" variant="lesson" backHref="/aluno/inicio" />
      <div className="vento-pc-original-hero"><StudentHero eyebrow="Seu próximo bordo" title="Monte sua aula" highlight="aula" lead="Escolha suas horas e os dias para ir ao mar." compact image="ocean" /></div>
      <div className="vento-pc-secondary-main vento-pc-builder"><LessonBuilder quotes={quotes} beaches={beaches} defaults={defaultsFrom(params, beaches, kiteLevel.effective)}
        studentLevel={kiteLevel.effective} occupiedSlots={occupiedSlots}
        allowPackageSelection={requestedHours(params.horas) === undefined}
        startEditing={!(params.praia || params.nivel || params.idioma || params.horas || params.dia)} /></div>
    </div>
  );
}
