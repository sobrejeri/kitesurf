import 'server-only';

import type { LessonLevel } from '@/lib/data-labels';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface BookingLevelAssessment {
  booking_id: string;
  meeting_id: string;
  assessed_level: LessonLevel;
  assessed_at: string;
}

/** Authenticated student/instructor may read only their own bookings via RLS. */
export async function getBookingLevelAssessments(bookingIds: string[]): Promise<{
  ready: boolean;
  assessments: Map<string, BookingLevelAssessment>;
}> {
  if (bookingIds.length === 0) return { ready: true, assessments: new Map() };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('booking_level_assessments')
    .select('booking_id, meeting_id, assessed_level, assessed_at')
    .in('booking_id', bookingIds)
    .returns<BookingLevelAssessment[]>();
  if (error) {
    console.warn('[booking.assessments]', { code: error.code });
    return { ready: false, assessments: new Map() };
  }
  return { ready: true, assessments: new Map((data ?? []).map((r) => [r.booking_id, r])) };
}
