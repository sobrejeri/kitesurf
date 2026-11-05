import type { Metadata } from 'next';

import { Icon, type IconName } from '@/components/icon';
import { LessonSearch } from '@/components/student/lesson-search';
import { HighlightTitle } from '@/components/student/sunset';
import { HomeDashboard } from '@/components/student/home-dashboard';
import { listBookingsForStudent, type StudentBooking } from '@/lib/data';
import { HomePosterHero } from '@/components/student/home-poster-hero';
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
  let bookings:StudentBooking[]=[];
  let historyUnavailable=false;
  if(viewer?.role==='student'){
    try{bookings=await listBookingsForStudent(viewer.id);}catch{historyUnavailable=true;}
  }
  const returning=bookings.length>0;


  return (
    <div className="vento-student-desktop-home">
      {!returning?<><div className="mb-3 hidden items-center justify-between lg:flex">
        <div>
          <p className="text-[15px] font-bold text-ink">Olá, {firstName || 'bem-vindo'}! <span aria-hidden="true">☀️</span></p>
          <p className="mt-1 text-[12px] text-muted">Preá e Jericoacoara</p>
        </div>
        <span className="rounded-full bg-sand px-4 py-2 text-[12px] text-label">Ceará, Brasil</span>
      </div>
      <HomePosterHero firstName={firstName} /></>:null}

      {returning?<HomeDashboard bookings={bookings} level={kiteLevel} firstName={firstName}/>:null}
      {historyUnavailable?<p role="status" className="my-5 rounded-xl border border-line bg-surface p-4 text-sm text-label">Não foi possível carregar suas aulas agora. <a className="text-brand underline" href="/aluno/inicio">Tentar novamente</a></p>:null}
      <LessonSearch defaultDate={lessonDate(1)} quotes={quotes} beaches={beaches}
        studentLevel={kiteLevel?.effective ?? 'first_time'} />


      {!returning && !historyUnavailable ? <><section className="vento-desktop-course-cards mt-9 hidden lg:block" aria-label="Experiências para cada nível">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-brand">Um mar de possibilidades</p>
            <h2 className="mt-2 text-[23px] font-bold text-ink">Encontre o seu ritmo.</h2>
            <p className="mt-1 text-[13px] text-muted">Aulas adaptadas ao seu nível, com instrutores aprovados.</p>
          </div>
          <a href="/aluno/aulas" className="text-[12px] font-semibold text-brand">Ver minhas aulas</a>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { badge: 'Para começar', title: 'Primeiros ventos', image: '/images/kite-lesson.webp' },
            { badge: 'Para retomar', title: 'Mais autonomia', image: '/images/kite-lesson.webp' },
            { badge: 'Para evoluir', title: 'Novos desafios', image: '/images/prea-coast.webp' },
          ].map((card, index) => (
            <article key={card.title} className="group relative h-[200px] overflow-hidden rounded-[16px] bg-[#0a5a75]">
              <img src={card.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                style={{ objectPosition: index === 1 ? '65% 50%' : '50% 60%' }} />
              <div className="absolute inset-0 bg-gradient-to-t from-[#002238]/90 via-transparent to-transparent" />
              <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-[#234568]">{card.badge}</span>
              <h3 className="absolute bottom-4 left-4 text-[19px] font-bold text-white">{card.title}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="relative mt-8 lg:hidden overflow-hidden rounded-[22px] border border-line bg-surface p-5 md:p-7">
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
      </section></>:null}
    </div>
  );
}
