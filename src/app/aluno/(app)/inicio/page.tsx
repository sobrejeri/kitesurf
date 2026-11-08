import type { Metadata } from 'next';

import { LessonSearch } from '@/components/student/lesson-search';
import { HomeDashboard } from '@/components/student/home-dashboard';
import { DesktopStudentHome } from '@/components/student/desktop-home';
import { OfficialLogo } from '@/components/official-logo';
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
      <div className="vento-pc-desktop-only">
        <DesktopStudentHome bookings={bookings} level={kiteLevel} firstName={firstName}>
          {!returning ? <LessonSearch defaultDate={lessonDate(1)} quotes={quotes} beaches={beaches}
            studentLevel={kiteLevel?.effective ?? 'first_time'} /> : null}
        </DesktopStudentHome>
      </div>
      <div className="vento-pc-mobile-original">
      {returning ? (
        // Aluno com aula registrada: apenas o painel (próxima aula, horas, nível).
        <HomeDashboard bookings={bookings} level={kiteLevel} firstName={firstName} instructorPhotoUrl={instructorPhotoUrl} />
      ) : (
        // Primeiro acesso, sem reserva: banner da campanha + busca de aulas.
        <div className="vento-atlantico-home md:pt-0">
          <section className="vento-atlantico-hero" aria-labelledby="atlantico-hero-title">
            {/* Crop the real promotional kitesurfer to its right-hand photo region;
                the baked-in campaign lettering remains outside this crop. */}
            <div className="vento-atlantico-hero-photo" aria-hidden="true">
              <img src="/images/promo-bordo.jpg" alt="" width={1671} height={666} />
            </div>
            <div className="vento-atlantico-hero-shade" aria-hidden="true" />
            <div className="vento-atlantico-hero-copy">
              <div className="vento-atlantico-brand">
                <OfficialLogo />
              </div>
              <div className="vento-atlantico-hero-message">
                <h1 id="atlantico-hero-title" className="vento-atlantico-hero-title">
                  <span>Liberdade</span>
                  <span>em cada</span>
                  <em>rajada</em>
                </h1>
                <p className="vento-atlantico-hero-lead">
                  Seu próximo<br />bordo começa aqui!
                </p>
              </div>
            </div>
            <svg className="vento-atlantico-hero-wave" viewBox="0 0 390 32" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 18 C80 2 135 30 230 15 S343 4 390 12 L390 32 L0 32Z" fill="#00d7df" />
              <path d="M0 25 C98 11 151 35 245 23 S342 16 390 23 L390 32 L0 32Z" fill="#00283d" />
            </svg>
          </section>
          <div className="vento-atlantico-search-container mt-3">
            <LessonSearch defaultDate={lessonDate(1)} quotes={quotes} beaches={beaches}
              studentLevel={kiteLevel?.effective ?? 'first_time'} />
          </div>
        </div>
      )}
      </div>
      {historyUnavailable ? (
        <p role="status" className="my-5 rounded-xl border border-line bg-surface p-4 text-sm text-label">Não foi possível carregar suas aulas agora. <a className="text-brand underline" href="/aluno/inicio">Tentar novamente</a></p>
      ) : null}
    </div>
  );
}
