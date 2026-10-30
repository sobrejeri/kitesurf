import type { Metadata } from 'next';

import { MyLessons } from '@/components/student/my-lessons';
import { ButtonLink, Eyebrow } from '@/components/ui';

export const metadata: Metadata = { title: 'Minhas aulas' };

export default function MyLessonsPage() {
  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow icon="sun">Sua agenda de bons ventos</Eyebrow>
          <h1 className="mt-2 text-[28px] tracking-[-0.9px] sm:text-[32px]">Minhas aulas</h1>
          <p className="mt-1 text-[13px] text-muted">Seu próximo encontro com o mar começa aqui.</p>
        </div>
        <ButtonLink href="/aluno/reservar" icon="plus">Nova aula</ButtonLink>
      </header>
      <MyLessons />
    </>
  );
}
