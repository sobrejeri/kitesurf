import type { Metadata } from 'next';

import { Icon } from '@/components/icon';
import { SectionTitle } from '@/components/shared';
import { LessonSearch, PathCard } from '@/components/student/lesson-search';
import { Card } from '@/components/ui';
import { STUDENT } from '@/data/demo';

export const metadata: Metadata = { title: 'Explorar' };

const PATHS = [
  {
    tag: 'Para começar',
    title: 'Meu primeiro contato',
    body: 'Aprenda os primeiros movimentos com orientação, no seu tempo.',
    image: '/images/kite-lesson.webp',
  },
  {
    tag: 'Para retomar',
    title: 'Voltar para o mar',
    body: 'Conte o que já aprendeu e continue de onde parou.',
    image: '/images/kite-lesson.webp',
  },
  {
    tag: 'Para evoluir',
    title: 'Ir um pouco além',
    body: 'Pratique suas habilidades com acompanhamento particular.',
    image: '/images/prea-coast.webp',
  },
] as const;

const STEPS = [
  ['Escolha suas horas', 'Conte a duração, a praia, o dia e seu idioma.'],
  ['Conheça seu instrutor', 'Encontre um profissional disponível para você.'],
  ['Viva e acompanhe', 'Suas aulas, seu saldo e cada nova conquista.'],
] as const;

export default function StudentHomePage() {
  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[17px] font-[550] text-[#374967]">
            Olá, {STUDENT.name}! <Icon name="sun" className="text-[#e8a23d]" />
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
            <Icon name="pin" className="!h-3.5 !w-3.5" /> {STUDENT.beaches}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-input border border-[#e6eaf5] bg-[#f1f4fd] px-3 py-2 text-[10px] text-[#7a8da9]">
          <Icon name="wind" className="!h-3.5 !w-3.5" /> {STUDENT.region}
        </span>
      </div>

      <section
        className="relative flex min-h-[150px] items-center overflow-hidden rounded-hero bg-cover bg-center px-5 py-8 sm:min-h-[220px] sm:px-10"
        style={{ backgroundImage: 'linear-gradient(90deg, #0d2b4ab3, #0d2b4a20 70%), url(/images/prea-coast.webp)' }}
      >
        <div className="max-w-md text-white">
          <h1 className="text-[24px] leading-tight tracking-[-0.6px] sm:text-[32px]">Seu próximo bordo começa aqui.</h1>
          <p className="mt-2 text-[12px] text-[#f0f5ff]">Escolha suas horas e encontre seu instrutor.</p>
        </div>
      </section>

      <LessonSearch defaultDate="2026-10-31" />

      <section className="mt-12">
        <p className="text-[10px] font-[550] uppercase tracking-[1px] text-brand">Um mar de possibilidades</p>
        <div className="mt-2">
          <SectionTitle title="Encontre o seu ritmo." action={{ label: 'Ver aulas', href: '/aluno/aulas' }} />
        </div>
        <p className="-mt-2 mb-5 text-[13px] text-muted">A aula acompanha seu nível. A duração é você quem escolhe.</p>
        <div className="grid gap-4 md:grid-cols-3">
          {PATHS.map((path) => (
            <PathCard key={path.title} {...path} />
          ))}
        </div>
      </section>

      <Card className="mt-6">
        <h2 className="text-[16px]">Da vontade de aprender ao primeiro bordo.</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {STEPS.map(([title, body], index) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-warning-soft text-[12px] font-[550] text-warning">
                {index + 1}
              </span>
              <span>
                <strong className="block text-[13px] font-[550]">{title}</strong>
                <span className="text-[12px] text-muted">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-brand-tint p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <Icon name="phone" className="!h-7 !w-7 text-brand" />
          <div>
            <p className="text-[16px] font-semibold">Leve os bons ventos com você.</p>
            <p className="text-[12px] text-muted">Adicione o Vento à tela inicial do celular.</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-surface px-5 py-3 text-[12px] font-[550] text-brand shadow-card">
          <Icon name="plus" className="!h-4 !w-4" /> Como instalar
        </span>
      </section>
    </>
  );
}
