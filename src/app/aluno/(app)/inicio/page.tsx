import type { Metadata } from 'next';

import { Icon, type IconName } from '@/components/icon';
import { LessonSearch } from '@/components/student/lesson-search';
import { HighlightTitle, StudentHero } from '@/components/student/sunset';
import { getViewer } from '@/lib/auth';
import { getQuoteTable, listActiveBeaches, type Beach, type QuoteRow } from '@/lib/data';
import { lessonDate } from '@/lib/dates';
import { getStudentKiteLevel } from '@/lib/student-kite-level';
import { supabaseConfig } from '@/lib/env';

export const metadata: Metadata = { title: 'Explorar' };

const STEPS: readonly { title: string; body: string; icon: IconName }[] = [
  { title: 'Escolha suas horas', body: 'Conte a duração, a praia, o dia e seu idioma.', icon: 'calendar' },
  { title: 'Conheça seu instrutor', body: 'Encontre um profissional disponível para você.', icon: 'user' },
  { title: 'Viva e acompanhe', body: 'Suas aulas, seu saldo e cada nova conquista.', icon: 'waves' },
];

async function loadQuotes(): Promise<QuoteRow[]> {
  if (!supabaseConfig) return [];
  try {
    return await getQuoteTable();
  } catch {
    // The page still works without prices; the quote line says so.
    return [];
  }
}

async function loadBeaches(): Promise<Beach[]> {
  if (!supabaseConfig) return [];
  try {
    return await listActiveBeaches();
  } catch {
    return [];
  }
}

export default async function StudentHomePage() {
  const [quotes, beaches, viewer] = await Promise.all([loadQuotes(), loadBeaches(), getViewer()]);
  const firstName = viewer?.fullName.split(' ')[0];
  const kiteLevel = viewer?.role === 'student' ? await getStudentKiteLevel(viewer.id) : null;

  return (
    <>
      <StudentHero
        eyebrow="Liberdade em cada rajada"
        title="Seu próximo bordo começa aqui."
        highlight="aqui."
        script
        lead={`${firstName ? `${firstName}, aulas` : 'Aulas'} de kitesurf para todos os níveis, no seu ritmo, com instrutores experientes.`}
      />

      <LessonSearch defaultDate={lessonDate(1)} quotes={quotes} beaches={beaches}
        studentLevel={kiteLevel?.effective ?? 'first_time'} />


      <section className="relative mt-8 overflow-hidden rounded-[22px] border border-line bg-surface p-5 md:p-7">
        <span className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,#ff7a1a40,transparent_65%)]" aria-hidden="true" />
        <HighlightTitle as="h2" text="Da vontade de aprender ao primeiro bordo." className="relative max-w-[18ch] text-[24px] font-bold leading-tight text-ink" />
        <ol className="relative mt-5 grid gap-5 sm:grid-cols-3 sm:divide-x sm:divide-line">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3 sm:block sm:px-4 sm:first:pl-0">
              <span className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-[16px] font-semibold text-brand">{index + 1}</span>
                <Icon name={step.icon} className="hidden !h-7 !w-7 text-ink sm:block" />
              </span>
              <span className="sm:mt-3 sm:block">
                <strong className="block text-[16px] font-semibold text-ink">{step.title}</strong>
                <span className="text-[13px] leading-snug text-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
