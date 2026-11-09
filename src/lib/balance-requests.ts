import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type BalanceRequest = {
  id: string;
  booking_id: string;
  student_id: string;
  instructor_id: string;
  proposed_starts_at: string;
  minutes: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  requested_at: string;
  expires_at: string;
  responded_at: string | null;
  created_meeting_id: string | null;
};

export type BalanceRequestRead = { ready: boolean; rows: BalanceRequest[] };

const COLUMNS =
  'id,booking_id,student_id,instructor_id,proposed_starts_at,minutes,status,requested_at,expires_at,responded_at,created_meeting_id';

/** Make-up requests for one booking (student view). RLS scopes to participants. */
export async function listBalanceRequests(bookingId: string): Promise<BalanceRequestRead> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from('balance_meeting_requests')
    .select(COLUMNS)
    .eq('booking_id', bookingId)
    .order('requested_at', { ascending: false })
    .limit(30).returns<BalanceRequest[]>();
  if (error) {
    console.warn('[balance.requests.read]', { code: error.code });
    return { ready: false, rows: [] };
  }
  return { ready: true, rows: data ?? [] };
}

/** Pending make-up requests awaiting the acting instructor's response. */
export async function listPendingBalanceRequestsForInstructor(
  instructorId: string,
): Promise<BalanceRequestRead> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from('balance_meeting_requests')
    .select(COLUMNS)
    .eq('instructor_id', instructorId)
    .eq('status', 'pending')
    .order('proposed_starts_at', { ascending: true })
    .limit(30).returns<BalanceRequest[]>();
  if (error) {
    console.warn('[balance.requests.instructor.read]', { code: error.code });
    return { ready: false, rows: [] };
  }
  return { ready: true, rows: data ?? [] };
}
