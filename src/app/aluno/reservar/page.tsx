import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@/components/icon';
import { LessonBuilder } from '@/components/student/lesson-builder';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Monte sua aula' };

export default function BuildLessonPage() {
  return (
    <>
      <Link href="/aluno/inicio" className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-[550] text-brand">
        <Icon name="back" className="!h-4 !w-4" /> Voltar para explorar
      </Link>
      <PageHeader title="Monte sua aula" lead="Escolha suas horas e os dias para ir ao mar." />
      <LessonBuilder />
    </>
  );
}
