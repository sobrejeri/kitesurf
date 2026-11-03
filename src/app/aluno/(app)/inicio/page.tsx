import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon, type IconName } from '@/components/icon';
import { LessonSearch } from '@/components/student/lesson-search';
import { HighlightTitle } from '@/components/student/sunset';
import { HomePosterHero } from '@/components/student/home-poster-hero';
import { getViewer } from '@/lib/auth';
import { getQuoteTable, listActiveBeaches, type Beach, type QuoteRow } from '@/lib/data';
import { lessonDate } from '@/lib/dates';
import { getStudentKiteLevel } from '@/lib/student-kite-level';
import { allowedLessonLevels } from '@/lib/kite-steps';
import type { LessonLevel } from '@/lib/data-labels';
import { supabaseConfig } from '@/lib/env';

export const metadata: Metadata = { title: 'Explorar' };

const DESKTOP_LEVELS: readonly { id: LessonLevel; tag: string; title: string; body: string; photo: string; position: string }[] = [
  { id: 'first_time', tag: 'Para começar', title: 'Primeiros ventos', body: 'Segurança, equipamento e controle do kite.', photo: '/images/kite-lesson.webp', position: '44% 40%' },
  { id: 'returning', tag: 'Para retomar', title: 'Mais autonomia', body: 'Navegação, bordos e transições.', photo: '/images/kite-lesson.webp', position: '68% 48%' },
  { id: 'improving', tag: 'Para evoluir', title: 'Sua próxima conquista', body: 'Performance e novas habilidades no mar.', photo: '/images/prea-coast.webp', position: '73% 50%' },
];


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
  const suggestedLevels = allowedLessonLevels(kiteLevel?.effective ?? 'first_time');

  return (
    <>
      <div className="hidden items-center justify-between pb-3 lg:flex">
        <div>
          <p className="text-[15px] font-bold text-[#253b60]">{firstName ? `Olá, ${firstName}!` : 'Olá!'}</p>
          <p className="mt-1 flex items-center gap-1 text-[12px] text-[#7385a0]"><Icon name="pin" className="!h-3.5 !w-3.5" /> Preá e Jericoacoara</p>
        </div>
        <span className="rounded-full bg-[#eaf0ff] px-4 py-2 text-[12px] font-semibold text-[#536dab]">Ceará, Brasil</span>
      </div>
      <HomePosterHero firstName={firstName} />

      <LessonSearch defaultDate={lessonDate(1)} quotes={quotes} beaches={beaches}
        studentLevel={kiteLevel?.effective ?? 'first_time'} />


      <section className="mt-9 hidden lg:block" aria-labelledby="desktop-levels-title">
        <p className="text-[11px] font-extrabold uppercase tracking-[.17em] text-[#4063ce]">Um mar de possibilidades</p>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <h2 id="desktop-levels-title" className="text-[29px] font-extrabold tracking-[-.045em] text-[#1b3358]">
              Encontre o seu ritmo.
            </h2>
            <p className="mt-1 text-[13px] text-[#72829a]">A aula acompanha seu nível. A duração é você quem escolhe.</p>
          </div>
          <Link href="/aluno/aulas" className="text-[13px] font-semibold text-[#3556d5] hover:underline">
            Ver minhas aulas →
          </Link>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {DESKTOP_LEVELS.filter((item) => suggestedLevels.includes(item.id)).map((item) => (
            <Link key={item.id} href={`/aluno/reservar?nivel=${item.id}`}
              className="desktop-levels-card group overflow-hidden transition-shadow hover:shadow-lg">
              <div className="relative overflow-hidden">
                <img src={item.photo} alt="" loading="lazy" className="transition-transform duration-300 group-hover:scale-[1.04]"
                  style={{ objectPosition: item.position }} />
                <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold text-[#335078]">
                  {item.tag}
                </span>
              </div>
              <div className="px-4 pb-4 pt-3">
                <h3 className="text-[17px] font-bold text-[#1b3358]">{item.title}</h3>
                <p className="mt-1 text-[12px] text-[#72829a]">{item.body}</p>
                <span className="mt-3 inline-block text-[12px] font-bold text-[#3556d5]">Montar aula →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="student-journey relative mt-8 overflow-hidden rounded-[22px] border border-line bg-surface p-5 md:p-7">
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
