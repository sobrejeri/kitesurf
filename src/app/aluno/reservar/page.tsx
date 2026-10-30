import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { LessonBuilder, type BuilderDefaults } from '@/components/student/lesson-builder';
import { PageHeader } from '@/components/ui';
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
      <Link href="/aluno/inicio" className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-[550] text-brand">
        <Icon name="back" className="!h-4 !w-4" /> Voltar para explorar
      </Link>
      <PageHeader title="Monte sua aula" lead="Escolha suas horas e os dias para ir ao mar." />
      <LessonBuilder quotes={quotes} defaults={defaultsFrom(params)} />
    </>
  );
}
