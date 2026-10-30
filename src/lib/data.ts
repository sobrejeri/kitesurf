import 'server-only';

import { createSupabaseServerClient } from './supabase/server';

/**
 * Every read the app makes, in one place. Queries run as the signed-in user,
 * so RLS decides which rows come back; the student and instructor queries are
 * also scoped to the viewer in the WHERE clause, so no code path asks for
 * someone else's rows in the first place.
 */

import { type Beach, type LessonLevel, type QuoteRow } from './data-labels';

export { LEVEL_LABELS, type Beach, type LessonLevel, type QuoteRow } from './data-labels';
export type BookingStatus = 'awaiting_payment' | 'confirmed' | 'cancelled' | 'completed';
export type MeetingStatus = 'scheduled' | 'in_progress' | 'done' | 'cancelled';
export type InstructorStatus = 'pending' | 'approved' | 'paused';

export const BOOKING_STATUS_LABELS: Readonly<Record<BookingStatus, string>> = {
  awaiting_payment: 'Aguardando pagamento',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Concluída',
};
export const MEETING_STATUS_LABELS: Readonly<Record<MeetingStatus, string>> = {
  scheduled: 'Agendada',
  in_progress: 'Em aula',
  done: 'Registrada',
  cancelled: 'Cancelada',
};

export interface Meeting {
  id: string;
  position: number;
  starts_at: string;
  minutes: number;
  status: MeetingStatus;
  done_minutes: number;
  note: string | null;
}

export interface Booking {
  id: string;
  code: string;
  status: BookingStatus;
  beach_id: string;
  beach: { name: string } | null;
  level: LessonLevel;
  language: string;
  total_hours: number;
  hourly_rate_cents: number;
  total_cents: number;
  partner_cents: number;
  platform_cents: number;
  instructor_net_cents: number;
  presence_code: string;
  created_at: string;
  student_id: string;
  instructor_id: string | null;
  partner_id: string | null;
  booking_meetings: Meeting[];
  student: { full_name: string } | null;
  instructor: { full_name: string } | null;
}

const BOOKING_COLUMNS = `
  id, code, status, beach_id, level, language, total_hours, hourly_rate_cents, total_cents,
  partner_cents, platform_cents, instructor_net_cents, presence_code, created_at,
  student_id, instructor_id, partner_id,
  booking_meetings ( id, position, starts_at, minutes, status, done_minutes, note ),
  beach:beaches ( name ),
  student:profiles!bookings_student_id_fkey ( full_name ),
  instructor:instructors ( profile:profiles ( full_name ) )
`;

interface RawBooking extends Omit<Booking, 'instructor'> {
  instructor: { profile: { full_name: string } | null } | null;
}

function normalise(raw: RawBooking): Booking {
  return {
    ...raw,
    instructor: raw.instructor?.profile ?? null,
    booking_meetings: [...raw.booking_meetings].sort((a, b) => a.position - b.position),
  };
}

export async function listBookingsForStudent(studentId: string): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .returns<RawBooking[]>();
  if (error) throw error;
  return (data ?? []).map(normalise);
}

export async function listBookingsForInstructor(instructorId: string): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('instructor_id', instructorId)
    .in('status', ['confirmed', 'completed', 'awaiting_payment'])
    .order('created_at', { ascending: false })
    .returns<RawBooking[]>();
  if (error) throw error;
  return (data ?? []).map(normalise);
}

/** Admin only: RLS returns nothing to anyone else. */
export async function listAllBookings(limit = 100): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<RawBooking[]>();
  if (error) throw error;
  return (data ?? []).map(normalise);
}

/**
 * One booking, for its student, its instructor or an admin. RLS already
 * refuses everyone else; the explicit check makes the rule visible here too.
 */
export async function getBookingForViewer(
  bookingId: string,
  viewer: { id: string; role: string },
): Promise<Booking | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('id', bookingId)
    .maybeSingle<RawBooking>();
  if (error) throw error;
  if (!data) return null;
  const allowed = viewer.role === 'admin' || data.student_id === viewer.id || data.instructor_id === viewer.id;
  return allowed ? normalise(data) : null;
}

export async function getQuoteTable(): Promise<QuoteRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('quote_table');
  if (error) throw error;
  return (data ?? []) as QuoteRow[];
}

export interface PriceVersion {
  id: number;
  hourly_rate_cents: number;
  platform_commission_bps: number;
  reason: string | null;
  created_at: string;
}

export async function listPriceVersions(): Promise<PriceVersion[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('price_versions')
    .select('id, hourly_rate_cents, platform_commission_bps, reason, created_at')
    .order('id', { ascending: false })
    .limit(10)
    .returns<PriceVersion[]>();
  if (error) throw error;
  return data ?? [];
}

export interface InstructorRow {
  id: string;
  status: InstructorStatus;
  years_experience: number;
  beaches: { id: string; name: string }[];
  languages: string[];
  has_equipment: boolean;
  queue_position: number | null;
  profile: { full_name: string } | null;
}

const INSTRUCTOR_COLUMNS =
  'id, status, years_experience, languages, has_equipment, queue_position, profile:profiles ( full_name ), instructor_beaches ( beach:beaches ( id, name ) )';

interface RawInstructor extends Omit<InstructorRow, 'beaches'> {
  instructor_beaches: { beach: { id: string; name: string } | null }[];
}

function normaliseInstructor({ instructor_beaches, ...row }: RawInstructor): InstructorRow {
  return {
    ...row,
    beaches: instructor_beaches
      .map((link) => link.beach)
      .filter((beach): beach is { id: string; name: string } => beach !== null)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };
}

/** Approved instructors in queue order. */
export async function listQueue(): Promise<InstructorRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('instructors')
    .select(INSTRUCTOR_COLUMNS)
    .eq('status', 'approved')
    .order('queue_position', { ascending: true })
    .returns<RawInstructor[]>();
  if (error) throw error;
  return (data ?? []).map(normaliseInstructor);
}

/** Admin only: pending and paused instructors are hidden from everyone else by RLS. */
export async function listAllInstructors(): Promise<InstructorRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('instructors')
    .select(INSTRUCTOR_COLUMNS)
    .order('created_at', { ascending: true })
    .returns<RawInstructor[]>();
  if (error) throw error;
  return (data ?? []).map(normaliseInstructor);
}

export async function getOwnInstructor(instructorId: string): Promise<InstructorRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('instructors')
    .select(INSTRUCTOR_COLUMNS)
    .eq('id', instructorId)
    .maybeSingle<RawInstructor>();
  if (error) throw error;
  return data ? normaliseInstructor(data) : null;
}

export interface PartnerRow {
  id: string;
  name: string;
  code: string;
  beach_id: string;
  beach: { name: string } | null;
  commission_bps: number;
  status: 'pending' | 'approved';
  created_at: string;
}

const PARTNER_COLUMNS = 'id, name, code, beach_id, beach:beaches ( name ), commission_bps, status, created_at';

export async function getOwnPartner(ownerId: string): Promise<PartnerRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('partners')
    .select(PARTNER_COLUMNS)
    .eq('owner_id', ownerId)
    .maybeSingle<PartnerRow>();
  if (error) throw error;
  return data;
}

export async function listAllPartners(): Promise<PartnerRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('partners')
    .select(PARTNER_COLUMNS)
    .order('created_at', { ascending: true })
    .returns<PartnerRow[]>();
  if (error) throw error;
  return data ?? [];
}

export interface PartnerSummary {
  bookings: number;
  pending_cents: number;
  released_cents: number;
}

export async function getPartnerSummary(): Promise<PartnerSummary> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('partner_summary');
  if (error) throw error;
  const row = (data as PartnerSummary[] | null)?.[0];
  return {
    bookings: Number(row?.bookings ?? 0),
    pending_cents: Number(row?.pending_cents ?? 0),
    released_cents: Number(row?.released_cents ?? 0),
  };
}

/** Minutes contracted, done, scheduled and still free for a list of bookings. */
export function learningBalance(bookings: readonly Booking[]) {
  const live = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed');
  let contracted = 0;
  let done = 0;
  let scheduled = 0;
  for (const booking of live) {
    contracted += booking.total_hours * 60;
    for (const meeting of booking.booking_meetings) {
      if (meeting.status === 'done') done += meeting.done_minutes;
      else if (meeting.status === 'scheduled' || meeting.status === 'in_progress') scheduled += meeting.minutes;
    }
  }
  return { contracted, done, scheduled, available: Math.max(contracted - done - scheduled, 0) };
}

/** Active beaches, for students, instructors and partner inns to choose from. */
export async function listActiveBeaches(): Promise<Beach[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('beaches')
    .select('id, name, region, active')
    .eq('active', true)
    .order('name', { ascending: true })
    .returns<Beach[]>();
  if (error) throw error;
  return data ?? [];
}

/** Every beach including inactive ones. RLS shows inactive rows to admins only. */
export async function listAllBeaches(): Promise<Beach[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('beaches')
    .select('id, name, region, active')
    .order('active', { ascending: false })
    .order('name', { ascending: true })
    .returns<Beach[]>();
  if (error) throw error;
  return data ?? [];
}

export interface AuditEntry {
  id: number;
  action: string;
  entity: string;
  entity_id: string;
  reason: string | null;
  created_at: string;
  actor: { full_name: string } | null;
}

/** Admin only: RLS returns nothing to anyone else. */
export async function listAuditLogs(limit = 100): Promise<AuditEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, entity, entity_id, reason, created_at, actor_id')
    .order('id', { ascending: false })
    .limit(limit)
    .returns<(Omit<AuditEntry, 'actor'> & { actor_id: string | null })[]>();
  if (error) throw error;
  const rows = data ?? [];
  // audit_logs has no foreign key to profiles (a log outlives its actor), so
  // names are looked up separately.
  const ids = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids).returns<{ id: string; full_name: string }[]>();
    for (const person of people ?? []) names.set(person.id, person.full_name);
  }
  return rows.map(({ actor_id, ...row }) => ({ ...row, actor: actor_id ? { full_name: names.get(actor_id) ?? '' } : null }));
}
