import type { Metadata } from 'next';

import { LessonSearch } from '@/components/student/lesson-search';
import { HomeDashboard } from '@/components/student/home-dashboard';
import { listBookingsForStudent, type StudentBooking } from '@/lib/data';
import { getViewer } from '@/lib/auth';
import { getQuoteTable, listActiveBeaches, type Beach, type QuoteRow } from '@/lib/data';
import { lessonDate } from '@/lib/dates';
import { getStudentKiteLevel } from '@/lib/student-kite-level';
import { studentHomeSummary } from '@/lib/student-home';
import { getStudentBookingInstructorAvatar } from '@/lib/student-booking-avatar';
import { supabaseConfig } from '@/lib/env';

export const metadata: Metadata = { title: 'Explorar' };

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
  // Real instructor photo for the next-lesson card (initials fallback in the component).
  const homeCurrentBookingId = returning ? (studentHomeSummary(bookings).current?.booking.id ?? null) : null;
  const instructorPhotoUrl = homeCurrentBookingId ? await getStudentBookingInstructorAvatar(homeCurrentBookingId) : null;

  return (
    <div className="vento-student-desktop-home">
      {returning ? (
        // Aluno com aula registrada: apenas o painel (próxima aula, horas, nível).
        <HomeDashboard bookings={bookings} level={kiteLevel} firstName={firstName} instructorPhotoUrl={instructorPhotoUrl} />
      ) : (
        // Primeiro acesso, sem reserva: banner da campanha + busca de aulas.
        <div className="vento-atlantico-home pt-[calc(env(safe-area-inset-top)+64px)] md:pt-0">
          <div className="vento-atlantico-brand" aria-label="VentoKite, aulas de kitesurf">
            <span className="vento-atlantico-brand-name">Vento<strong>Kite</strong></span>
            <span className="vento-atlantico-brand-caption">AULAS DE KITESURF <span aria-hidden="true">≋</span></span>
          </div>
          <a
            href="/aluno/reservar"
            aria-label="Seu próximo bordo começa aqui — aulas de kitesurf para todos os níveis, no seu ritmo, com instrutores experientes. Agendar uma aula."
            className="vento-atlantico-hero press relative block overflow-hidden rounded-[20px] border border-[#2a86a8] shadow-[0_14px_34px_#000f2066]"
          >
            <img src="/images/promo-bordo.jpg" alt="" width={1671} height={666} className="vento-atlantico-hero-image block h-auto w-full" />
            <svg className="vento-atlantico-hero-wave" viewBox="0 0 390 29" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 18 C80 -3 134 29 228 14 S342 3 390 12 L390 29 L0 29Z" fill="#04d9e6" />
              <path d="M0 24 C97 9 155 31 242 22 S341 16 390 21 L390 29 L0 29Z" fill="#00243a" />
            </svg>
          </a>
          <div className="vento-atlantico-search-container mt-3">
            <LessonSearch defaultDate={lessonDate(1)} quotes={quotes} beaches={beaches}
              studentLevel={kiteLevel?.effective ?? 'first_time'} />
          </div>
        </div>
      )}
      {historyUnavailable ? (
        <p role="status" className="my-5 rounded-xl border border-line bg-surface p-4 text-sm text-label">Não foi possível carregar suas aulas agora. <a className="text-brand underline" href="/aluno/inicio">Tentar novamente</a></p>
      ) : null}
    </div>
  );
}
