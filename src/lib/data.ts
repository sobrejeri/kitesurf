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
  is_test: boolean;
  beach_id: string;
  beach: { name: string } | null;
  level: LessonLevel;
  language: string;
  total_hours: number;
  hourly_rate_cents: number;
  with_transport: boolean;
  transport_hourly_cents: number;
  transport_cents: number;
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
  id, code, status, is_test, beach_id, level, language, total_hours, hourly_rate_cents,
  with_transport, transport_hourly_cents, transport_cents, total_cents,
  partner_cents, platform_cents, instructor_net_cents, presence_code, created_at,
  student_id, instructor_id, partner_id,
  booking_meetings ( id, position, starts_at, minutes, status, done_minutes, note ),
  beach:beaches ( name ),
  student:profiles!bookings_student_id_fkey ( full_name ),
  -- Explicit FK required since Migration 27 also links profiles.kite_assessed_by
  -- to instructors; PostgREST otherwise raises PGRST201 for BOTH workspaces.
  instructor:instructors ( profile:profiles!instructors_id_fkey ( full_name ) )
`;

// Transport fields were added after the original booking schema. A missing
// optional field must not crash the instructor workspace before that migration.
const LEGACY_BOOKING_COLUMNS = BOOKING_COLUMNS.replace(
  'with_transport, transport_hourly_cents, transport_cents, ',
  '',
);
// A new deploy must continue to read bookings before migration 20 runs.
const PRETEST_BOOKING_COLUMNS = BOOKING_COLUMNS.replace('is_test, ', '');

function missingTestColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error &&
    (error.code === '42703' || error.code === 'PGRST204') &&
    /\bis_test\b/i.test(error.message ?? ''));
}

function missingTransportColumn(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error &&
    (error.code === '42703' || error.code === 'PGRST204') &&
    /\b(has_support_vehicle|with_transport|transport_hourly_cents|transport_cents)\b/i.test(error.message ?? ''));
}

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

/**
 * Student history needs only a few booking fields; never couple these three
 * pages to the financial snapshot or PostgREST's multi-level relationship join.
 *
 * Extra finance columns are added by later migrations. A large nested select
 * makes even an empty student account crash when a deployment uses an older
 * schema (or the API relationship cache is behind the migration).
 */
export type StudentBooking = Pick<
  Booking,
  'id' | 'status' | 'is_test' | 'student_id' | 'instructor_id' | 'beach_id' | 'level' | 'total_hours' |
  'created_at' | 'booking_meetings' | 'beach' | 'instructor'
>;

type StudentBookingBase = Omit<StudentBooking, 'booking_meetings' | 'beach' | 'instructor'>;
type StudentMeetingRow = Meeting & { booking_id: string };

export async function listBookingsForStudent(studentId: string): Promise<StudentBooking[]> {
  const supabase = await createSupabaseServerClient();
  const read = (columns: string) => supabase.from('bookings').select(columns)
    .eq('student_id', studentId).order('created_at', { ascending: false })
    .returns<StudentBookingBase[]>();
  const result = await read('id, status, is_test, student_id, instructor_id, beach_id, level, total_hours, created_at');
  let bookings: StudentBookingBase[];
  if (missingTestColumn(result.error)) {
    const old = await read('id, status, student_id, instructor_id, beach_id, level, total_hours, created_at');
    if (old.error) throw new Error('Não foi possível consultar suas reservas.');
    bookings = (old.data ?? []).map((b) => ({ ...b, is_test: false }));
  } else if (result.error) {
    console.error('[student-bookings] Failed to read bookings', {
      code: result.error.code, message: result.error.message,
    });
    throw new Error('Não foi possível consultar suas reservas.');
  } else {
    bookings = result.data ?? [];
  }
  if (bookings.length === 0) return [];

  const bookingIds = bookings.map((booking) => booking.id);
  const beachIds = [...new Set(bookings.map((booking) => booking.beach_id))];
  const instructorIds = [...new Set(
    bookings.map((booking) => booking.instructor_id).filter((id): id is string => id !== null),
  )];

  // Relations are loaded independently under the same signed-in user's RLS.
  // Profile metadata is optional; missing permission should not hide a booking.
  const [meetingResult, beachResult, instructorResult] = await Promise.all([
    supabase
      .from('booking_meetings')
      .select('id, booking_id, position, starts_at, minutes, status, done_minutes, note')
      .in('booking_id', bookingIds)
      .returns<StudentMeetingRow[]>(),
    supabase
      .from('beaches')
      .select('id, name')
      .in('id', beachIds)
      .returns<{ id: string; name: string }[]>(),
    instructorIds.length > 0
      ? supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', instructorIds)
          .returns<{ id: string; full_name: string }[]>()
      : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null }),
  ]);

  if (meetingResult.error) {
    console.error('[student-bookings] Failed to read meetings', {
      code: meetingResult.error.code,
      message: meetingResult.error.message,
    });
    throw new Error('Não foi possível consultar os encontros da reserva.');
  }
  if (beachResult.error) {
    console.error('[student-bookings] Failed to read beaches', { code: beachResult.error.code, message: beachResult.error.message });
  }
  if (instructorResult.error) {
    console.error('[student-bookings] Failed to read instructor names', {
      code: instructorResult.error.code, message: instructorResult.error.message,
    });
  }

  const meetingMap = new Map<string, Meeting[]>();
  for (const { booking_id, ...meeting } of meetingResult.data ?? []) {
    const entries = meetingMap.get(booking_id) ?? [];
    entries.push(meeting);
    meetingMap.set(booking_id, entries);
  }
  const beaches = new Map((beachResult.data ?? []).map((item) => [item.id, { name: item.name }]));
  const instructors = new Map((instructorResult.data ?? []).map((item) => [item.id, { full_name: item.full_name }]));

  return bookings.map((booking) => ({
    ...booking,
    beach: beaches.get(booking.beach_id) ?? null,
    instructor: booking.instructor_id ? instructors.get(booking.instructor_id) ?? null : null,
    booking_meetings: (meetingMap.get(booking.id) ?? []).sort((a, b) => a.position - b.position),
  }));
}

export async function listBookingsForInstructor(instructorId: string): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const read = (columns: string) => supabase
    .from('bookings')
    .select(columns)
    .eq('instructor_id', instructorId)
    .in('status', ['confirmed', 'completed', 'awaiting_payment'])
    .order('created_at', { ascending: false })
    .returns<RawBooking[]>();

  const result = await read(BOOKING_COLUMNS);
  if (missingTestColumn(result.error)) {
    const old = await read(PRETEST_BOOKING_COLUMNS);
    if (old.error) throw old.error;
    return (old.data ?? []).map((b) => normalise({ ...b, is_test: false }));
  }
  if (missingTransportColumn(result.error)) {
    console.warn('[instructor-bookings] Transport columns not installed; using legacy read');
    const legacy = await read(LEGACY_BOOKING_COLUMNS);
    if (legacy.error) {
      console.error('[instructor-bookings] Legacy read failed', { code: legacy.error.code, message: legacy.error.message });
      throw legacy.error;
    }
    return (legacy.data ?? []).map((row) => normalise({
      ...row, with_transport: false, transport_hourly_cents: 0, transport_cents: 0,
    }));
  }
  if (result.error) {
    console.error('[instructor-bookings] Read failed', { code: result.error.code, message: result.error.message });
    throw result.error;
  }
  return (result.data ?? []).map(normalise);
}

/** Admin only: RLS returns nothing to anyone else. */
export async function listAllBookings(limit = 100): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const read = (columns: string) => supabase.from('bookings')
    .select(columns).order('created_at', { ascending: false })
    .limit(limit).returns<RawBooking[]>();
  const result = await read(BOOKING_COLUMNS);
  if (missingTestColumn(result.error)) {
    const old = await read(PRETEST_BOOKING_COLUMNS);
    if (old.error) throw old.error;
    return (old.data ?? []).map((b) => normalise({ ...b, is_test: false }));
  }
  if (result.error) {
    console.error('[admin-bookings] Read failed', {
      code: result.error.code,
      message: result.error.message,
    });
    throw result.error;
  }
  return (result.data ?? []).map(normalise);
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
  const read = (columns: string) => supabase.from('bookings')
    .select(columns).eq('id', bookingId).maybeSingle<RawBooking>();
  const result = await read(BOOKING_COLUMNS);
  let data: RawBooking | null = result.data;
  if (missingTestColumn(result.error)) {
    const old = await read(PRETEST_BOOKING_COLUMNS);
    if (old.error) throw old.error;
    data = old.data ? { ...old.data, is_test: false } : null;
  } else if (result.error) {
    throw result.error;
  }
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
  transport_hourly_cents: number;
  reason: string | null;
  created_at: string;
}

export async function listPriceVersions(): Promise<PriceVersion[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('price_versions')
    .select('id, hourly_rate_cents, platform_commission_bps, transport_hourly_cents, reason, created_at')
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
  has_support_vehicle: boolean;
  queue_position: number | null;
  profile: { full_name: string } | null;
}

// Avoid ambiguous embedding (PGRST201): Migration 27 added
// profiles.kite_assessed_by -> instructors, so the original 1:1 join needs its FK.
const INSTRUCTOR_COLUMNS =
  'id, status, years_experience, languages, has_equipment, has_support_vehicle, queue_position, profile:profiles!instructors_id_fkey ( full_name ), instructor_beaches ( beach:beaches ( id, name ) )';
const LEGACY_INSTRUCTOR_COLUMNS = INSTRUCTOR_COLUMNS.replace(', has_support_vehicle', '');

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
  const read = (columns: string) => supabase.from('instructors').select(columns)
    .eq('status', 'approved')
    .order('queue_position', { ascending: true })
    .returns<RawInstructor[]>();
  const result = await read(INSTRUCTOR_COLUMNS);
  if (missingTransportColumn(result.error)) {
    const legacy = await read(LEGACY_INSTRUCTOR_COLUMNS);
    if (legacy.error) throw legacy.error;
    return (legacy.data ?? []).map((row) => normaliseInstructor({ ...row, has_support_vehicle: false }));
  }
  if (result.error) throw result.error;
  return (result.data ?? []).map(normaliseInstructor);
}

/** Admin only: pending and paused instructors are hidden from everyone else by RLS. */
export async function listAllInstructors(): Promise<InstructorRow[]> {
  const supabase = await createSupabaseServerClient();
  const read = (columns: string) => supabase.from('instructors').select(columns)
    .order('created_at', { ascending: true })
    .returns<RawInstructor[]>();
  const result = await read(INSTRUCTOR_COLUMNS);
  if (missingTransportColumn(result.error)) {
    const legacy = await read(LEGACY_INSTRUCTOR_COLUMNS);
    if (legacy.error) throw legacy.error;
    return (legacy.data ?? []).map((row) => normaliseInstructor({ ...row, has_support_vehicle: false }));
  }
  if (result.error) throw result.error;
  return (result.data ?? []).map(normaliseInstructor);
}

export async function getOwnInstructor(instructorId: string): Promise<InstructorRow | null> {
  const supabase = await createSupabaseServerClient();
  const read = (columns: string) => supabase.from('instructors').select(columns)
    .eq('id', instructorId)
    .maybeSingle<RawInstructor>();
  const result = await read(INSTRUCTOR_COLUMNS);
  if (missingTransportColumn(result.error)) {
    console.warn('[instructor-profile] Transport column not installed; using legacy read');
    const legacy = await read(LEGACY_INSTRUCTOR_COLUMNS);
    if (legacy.error) {
      console.error('[instructor-profile] Legacy read failed', { code: legacy.error.code, message: legacy.error.message });
      throw legacy.error;
    }
    return legacy.data ? normaliseInstructor({ ...legacy.data, has_support_vehicle: false }) : null;
  }
  if (result.error) {
    console.error('[instructor-profile] Read failed', { code: result.error.code, message: result.error.message });
    throw result.error;
  }
  return result.data ? normaliseInstructor(result.data) : null;
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
export function learningBalance(bookings: readonly Pick<Booking, 'status' | 'total_hours' | 'booking_meetings'>[]) {
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
