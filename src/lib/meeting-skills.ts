import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { MeetingKiteSkill } from '@/lib/kite-steps';

/**
 * All rows are subject to RLS: only the student and assigned instructor
 * may read milestones. The table is optional until migration 26 is applied.
 */
export async function getMeetingKiteSkills(meetingIds: string[]): Promise<{
  ready: boolean;
  rows: MeetingKiteSkill[];
}> {
  const db = await createSupabaseServerClient();
  const query = db.from('meeting_skill_progress')
    .select('meeting_id, step_number, result');
  const { data, error } = meetingIds.length
    ? await query.in('meeting_id', meetingIds)
        .returns<MeetingKiteSkill[]>()
    : await query.limit(0).returns<MeetingKiteSkill[]>();

  if (error) {
    console.warn('[kite.skills.load]', { code: error.code, message: error.message });
    return { ready: false, rows: [] };
  }
  return { ready: true, rows: data ?? [] };
}
