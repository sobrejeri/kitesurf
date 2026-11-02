'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { explainAdminDemoSchedule, type AdminDemoSlot, type AdminBookedMeeting } from '@/lib/admin-test-schedule';
import { friendlyError, type ActionState } from './errors';

const UUID=z.uuid();
const DateTime=z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/);

function refresh() {
  revalidatePath('/admin/aula-teste');
  revalidatePath('/admin/reservas');
  revalidatePath('/admin/agenda');
  revalidatePath('/instrutor/hoje');
  revalidatePath('/instrutor/agenda');
  revalidatePath('/instrutor/aula');
  revalidatePath('/instrutor/financeiro');
  revalidatePath('/admin/financeiro');
  revalidatePath('/aluno/aulas');
}

type ServerDb = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Read-only diagnosis after a database rejection. Never bypasses the
 * authoritative instructor_can_attend checks or writes any bookings.
 */
async function explainRejectedDemoSlots(
  db: ServerDb, instructorId: string, slots: AdminDemoSlot[],
): Promise<string | null> {
  try {
    const earliest = Math.min(...slots.map((slot) => slot.epoch));
    const latest = Math.max(...slots.map((slot) => slot.epoch + slot.hours * 3600000));
    const [settings, weekly, timeOff, bookings] = await Promise.all([
      db.from('instructor_schedule_settings')
        .select('buffer_minutes').eq('instructor_id', instructorId)
        .maybeSingle<{ buffer_minutes: number }>(),
      db.from('instructor_weekly_hours')
        .select('weekday,opens_at,closes_at').eq('instructor_id', instructorId)
        .returns<{ weekday: number; opens_at: string; closes_at: string }[]>(),
      db.from('instructor_time_off')
        .select('starts_at,ends_at').eq('instructor_id', instructorId)
        .lt('starts_at', new Date(latest).toISOString())
        .gt('ends_at', new Date(earliest).toISOString())
        .returns<{ starts_at: string; ends_at: string }[]>(),
      db.from('bookings').select('id,code,status,created_at')
        .eq('instructor_id', instructorId).in('status',['confirmed','awaiting_payment'])
        .limit(1000).returns<{
          id: string; code: string;
          status: 'confirmed' | 'awaiting_payment'; created_at: string;
        }[]>(),
    ]);
    if (settings.error || weekly.error || timeOff.error || bookings.error) {
      console.warn('[admin.test_booking.diagnostic.read]', {
        settings: settings.error?.code,
        weekly: weekly.error?.code,
        timeOff: timeOff.error?.code,
        bookings: bookings.error?.code,
      });
      return null;
    }
    const relevant = (bookings.data ?? []).filter((booking) =>
      booking.status === 'confirmed' || Date.parse(booking.created_at) >= Date.now()-600000);
    const bookingIds = relevant.map((booking) => booking.id);
    const meetingResult = bookingIds.length
      ? await db.from('booking_meetings')
        .select('booking_id,starts_at,minutes,status')
        .in('booking_id',bookingIds)
        .neq('status','cancelled')
        .gte('starts_at',new Date(earliest-86400000).toISOString())
        .lte('starts_at',new Date(latest).toISOString())
        .limit(3000)
        .returns<{booking_id:string;starts_at:string;minutes:number;status:string}[]>()
      : { data: [], error: null };

    if (meetingResult.error) {
      console.warn('[admin.test_booking.diagnostic.meetings]',meetingResult.error.code);
      return null;
    }
    const bookingsById = new Map(relevant.map((booking)=>[booking.id,booking]));
    const occupied: AdminBookedMeeting[] = (meetingResult.data ?? []).flatMap((meeting) => {
      const booking = bookingsById.get(meeting.booking_id);
      return booking ? [{
        code:booking.code, starts_at:meeting.starts_at, minutes:meeting.minutes,
        status:booking.status, booking_created_at:booking.created_at,
      }] : [];
    });
    const reasons = explainAdminDemoSchedule(slots, {
      configured: Boolean(settings.data),
      bufferMinutes: settings.data?.buffer_minutes ?? 0,
      weekly: weekly.data ?? [],
      timeOff: timeOff.data ?? [],
      booked: occupied,
    }, Date.now());
    return reasons.length
      ? reasons.join(' ')
      : null;
  } catch (error) {
    console.error('[admin.test_booking.diagnostic.failure]', error);
    return null;
  }
}

/** Only admins may create a test booking; SQL independently validates role. */
export async function createAdminTestLesson(_prev:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['admin']);
  if(viewer.role!=='admin')return {error:'Esta ação é restrita à administração.'};
  const starts=form.getAll('meetingStart');
  const hours=form.getAll('meetingHours');
  if(starts.length===0||starts.length>4||starts.length!==hours.length)
    return {error:'Informe de 1 a 4 encontros da mesma reserva.'};

  const parsed=z.strictObject({
    instructorId:UUID, studentId:UUID, beachId:UUID,
    meetings:z.array(z.strictObject({
      start:DateTime,
      hours:z.coerce.number().int().min(1).max(8),
    })).min(1).max(4),
  }).safeParse({
    instructorId:form.get('instructorId'),
    studentId:form.get('studentId'),
    beachId:form.get('beachId'),
    meetings:starts.map((start,index)=>({start,hours:hours[index]})),
  });
  if(!parsed.success)return {error:'Revise instrutor, aluno, praia e data/duração dos encontros.'};

  const now=Date.now();
  const slots=parsed.data.meetings.map((meeting)=>({
    starts_at:meeting.start+':00-03:00',
    hours:meeting.hours,
    epoch:Date.parse(meeting.start+':00-03:00'),
  }));
  const totalHours=slots.reduce((sum,meeting)=>sum+meeting.hours,0);
  if(totalHours>8)return {error:'Uma reserva teste pode ter no máximo 8 horas somadas.'};
  if(slots.some((meeting)=>!Number.isFinite(meeting.epoch)
    ||meeting.epoch<now+3600000
    ||meeting.epoch>now+60*86400000))
    return {error:'Cada encontro deve ser agendado com 1 hora de antecedência e até 60 dias.'};
  const chronological=[...slots].sort((a,b)=>a.epoch-b.epoch);
  if(chronological.some((meeting,index)=>{
    const previous=chronological[index-1];
    return previous ? meeting.epoch<previous.epoch+previous.hours*3600000 : false;
  }))
    return {error:'Os encontros desta reserva não podem ter horários sobrepostos.'};

  const db=await createSupabaseServerClient();
  const {data,error}=await db.rpc('create_admin_test_booking',{
    p_instructor_id:parsed.data.instructorId,
    p_student_id:parsed.data.studentId,
    p_beach_id:parsed.data.beachId,
    p_meetings:chronological.map(({starts_at,hours})=>({starts_at,hours})),
  });
  if(error){
    // Before migration 29, legacy single-class tests still work.
    const first=chronological[0];
    if(chronological.length===1 && first && error.code==='PGRST202' &&
      /create_admin_test_booking/i.test(error.message)){
      const legacy=await db.rpc('create_admin_test_lesson',{
        p_instructor_id:parsed.data.instructorId,
        p_student_id:parsed.data.studentId,
        p_beach_id:parsed.data.beachId,
        p_starts_at:first.starts_at,
        p_hours:first.hours,
      });
      if(legacy.error){
        console.error('[admin.test_lesson.create.legacy]',{
          code:legacy.error.code,message:legacy.error.message,
        });
        return {error:friendlyError(legacy.error)};
      }
      refresh();
      return {ok:'Aula teste agendada (modo anterior). Código: '+String(legacy.data).slice(0,8)};
    }
    if(error.code==='PGRST202'){
      return {error:'Para criar vários encontros, execute a Migration 29 no Supabase e atualize a página.'};
    }
    console.error('[admin.test_lesson.create]',{code:error.code,message:error.message});
    if (error.code==='55000' && /instructor has a class or block at a selected time/i.test(error.message)) {
      const details = await explainRejectedDemoSlots(
        db,parsed.data.instructorId,chronological,
      );
      if (details) return {error:details};
    }
    return {error:friendlyError(error)};
  }
  refresh();
  return {ok:parsed.data.meetings.length+' encontro(s) teste agendado(s) na mesma reserva! Código interno: '+String(data).slice(0,8)+'. Confira no Instrutor e no Aluno.'};
}

export async function cancelAdminTestLesson(_prev:ActionState,form:FormData):Promise<ActionState> {
  const viewer=await requireRole(['admin']);
  if(viewer.role!=='admin')return {error:'Esta ação é restrita à administração.'};
  const parsed=UUID.safeParse(form.get('bookingId'));
  if(!parsed.success)return {error:'Aula de teste inválida.'};
  const db=await createSupabaseServerClient();
  const {error}=await db.rpc('cancel_admin_test_lesson',{p_booking_id:parsed.data});
  if(error){
    console.error('[admin.test_lesson.cancel]',{code:error.code,message:error.message});
    return {error:friendlyError(error)};
  }
  refresh();
  return {ok:'Aula teste cancelada. Ela não aparecerá nos próximos encontros.'};
}
