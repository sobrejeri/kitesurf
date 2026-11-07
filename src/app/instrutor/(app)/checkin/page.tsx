import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { startMeeting } from '@/app/actions/instructor';
import { ActionForm } from '@/components/action-form';
import { requireRole } from '@/lib/auth';
import { listBookingsForInstructor } from '@/lib/data';
import { formatDateLong,formatTime,formatMinutes } from '@/lib/format';
export const metadata:Metadata={title:'Validar encontro'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The scanned QR never starts a lesson without the instructor explicitly confirming.
 * The startMeeting RPC checks instructor ownership, presence code and schedule on the server. */
export default async function CheckInPage({searchParams}:{
  searchParams:Promise<{meetingId?:string;presenceCode?:string}>;
}) {
  const viewer=await requireRole(['instructor'],'/instrutor/checkin');
  const params=await searchParams;
  const meetingId=params.meetingId ?? '';
  const presenceCode=params.presenceCode ?? '';
  if(!UUID.test(meetingId) || !/^\d{4}$/.test(presenceCode)) notFound();
  const bookings=await listBookingsForInstructor(viewer.id);
  const booking=bookings.find(b=>b.instructor_id===viewer.id && b.booking_meetings.some(m=>m.id===meetingId));
  if(!booking) notFound();
  const meeting=booking.booking_meetings.find(m=>m.id===meetingId)!;
  const eligible=booking.status==='confirmed' && meeting.status==='scheduled';
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center bg-[#00283e] px-5 py-10 text-[#f0fbff]">
    <section className="rounded-[24px] border border-[#18cbd9] bg-[#04364e] p-6 shadow-2xl">
      <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#baff06]">VentoKite • Presença</p>
      <h1 className="mt-3 text-2xl font-bold">Iniciar encontro</h1>
      <p className="mt-3 text-sm text-[#c8e3ee]">Reserva {booking.code}</p>
      <p className="mt-1 text-base font-semibold">{formatDateLong(meeting.starts_at)} às {formatTime(meeting.starts_at)} • {formatMinutes(meeting.minutes)}</p>
      <p className="mt-1 text-sm">{booking.beach?.name ?? 'Local a confirmar'}</p>
      {eligible ? <ActionForm action={startMeeting} submitLabel="Confirmar início da aula" className="mt-6">
        <input type="hidden" name="meetingId" value={meetingId}/>
        <input type="hidden" name="presenceCode" value={presenceCode}/>
      </ActionForm> : <p role="status" className="mt-5 rounded-xl border border-[#c6a365] p-3 text-sm">
        Este encontro não está disponível para iniciar. Consulte a situação da aula.
      </p>}
      <Link href="/instrutor/aula" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-[#baff06] underline">
        Voltar para minhas aulas
      </Link>
    </section>
  </main>;
}
